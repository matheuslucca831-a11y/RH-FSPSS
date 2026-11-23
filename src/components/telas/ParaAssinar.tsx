'use client';

import { useMemo, useState } from 'react';
import { CheckCheck, CheckSquare, KeyRound, Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarSolicitacoes } from '@/lib/consultas';
import { buscarFila } from '@/lib/fila';
import { emAnalise, type ItemFila } from '@/lib/solicitacoes';
import { PAPEIS, type Perfil } from '@/lib/types';
import { Aviso, Cabecalho, Segmentos } from '@/components/ui';
import ListaSolicitacoes from '@/components/solicitacoes/Lista';
import { AcoesAssinatura, avisarMudanca } from '@/components/solicitacoes/Acoes';
import { autorizarComSenha } from '@/components/assinatura/CampoAssinatura';
import { mostrarRecado } from '@/components/Recado';

type Visao = 'voce' | 'substituir' | 'andamento' | 'finalizadas';

const EXPLICA = 'Aqui ficam os pedidos que esperam a sua assinatura. Leia, digite a sua senha e toque em Assinar (ou Negar, explicando o motivo). '
  + 'Tem vários? Marque todos e assine de uma vez. Quem assina cada pedido é definido pela Direção.';

/** Pode entrar no "assinar vários": assinatura simples, sem escolher substituição nem escrever motivo */
const simples = (i?: ItemFila) => !!i && !i.precisa_motivo && i.como === 'titular' && i.vagas.length === 1;

/** Tudo o que espera a assinatura de quem está usando, conforme o fluxo de cada pedido */
export default function ParaAssinar({ perfil }: { perfil: Perfil }) {
  const supabase = useMemo(() => createClient(), []);
  const [visao, setVisao] = useState<Visao>('voce');
  const [ok, setOk] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [senhaLote, setSenhaLote] = useState('');
  const [lote, setLote] = useState<{ feitos: number; total: number } | null>(null);
  const [erroLote, setErroLote] = useState<string | null>(null);
  const gestao = perfil.papel === 'direcao' || perfil.papel === 'coordenacao';
  const variasUnidades = gestao || perfil.papel === 'supervisor' || perfil.papel === 'diretor' || (perfil.supervisiona?.length ?? 0) > 0;

  const { dados, erro, recarregar } = useConsulta(`assinar:${perfil.id}`, async () => {
    const [fila, lista] = await Promise.all([
      buscarFila(supabase),
      // Direção e Coordenação veem tudo: aqui só o que está em análise. Chefias: as unidades delas.
      buscarSolicitacoes(supabase, (q) => {
        const base = q.neq('solicitante_id', perfil.id);
        return gestao ? base.like('situacao', 'Aguardando%') : base;
      }, true),
    ]);
    return { fila, lista };
  });

  const grupos = useMemo(() => {
    const fila = new Map((dados?.fila ?? []).map((i) => [i.id, i]));
    const l = dados?.lista ?? [];
    return {
      fila,
      voce: l.filter((s) => fila.get(s.id) && !fila.get(s.id)!.precisa_motivo),
      substituir: l.filter((s) => fila.get(s.id)?.precisa_motivo),
      andamento: l.filter((s) => emAnalise(s) && !fila.has(s.id)),
      finalizadas: l.filter((s) => !emAnalise(s)).reverse(),
    };
  }, [dados]);

  const elegiveis = grupos.voce.filter((s) => simples(grupos.fila.get(s.id)));
  const marcadosValidos = [...marcados].filter((id) => elegiveis.some((s) => s.id === id));

  function alternar(id: string) {
    setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function assinarVarios() {
    if (!senhaLote) return setErroLote('Digite a sua senha para assinar.');
    setErroLote(null);
    setLote({ feitos: 0, total: marcadosValidos.length });
    let feitos = 0;
    const falhas: string[] = [];
    for (const id of marcadosValidos) {
      // cada assinatura usa uma autorização própria (a senha é conferida a cada uma, e não é guardada)
      const a = await autorizarComSenha(supabase, senhaLote);
      if (a.erro) { falhas.push(a.erro); break; }
      const { error } = await supabase.rpc('assinar', {
        p_id: id, p_aprovar: true, p_obs: null, p_no_lugar_de: null, p_motivo_ausencia: null, p_outra_ciente: false, p_token: a.token,
      });
      if (error) {
        const s = grupos.voce.find((x) => x.id === id);
        falhas.push(`${s?.solicitante_nome ?? 'Pedido'}: ${error.message}`);
      } else feitos += 1;
      setLote({ feitos, total: marcadosValidos.length });
    }
    setLote(null);
    setSenhaLote('');
    setMarcados(new Set());
    avisarMudanca();
    recarregar();
    if (feitos) {
      const m = `${feitos} ${feitos === 1 ? 'pedido assinado' : 'pedidos assinados'}.`;
      setOk(m);
      mostrarRecado(m);
    }
    if (falhas.length) setErroLote(falhas.join(' | '));
  }

  const temSubstituicao = perfil.papel === 'direcao' || grupos.substituir.length > 0;
  const VISOES = [
    ['voce', 'Aguardando você'] as const,
    ...(temSubstituicao ? [['substituir', perfil.papel === 'direcao' ? 'Parados nas unidades' : 'No lugar de ausente'] as const] : []),
    ['andamento', 'Em andamento'] as const,
    ...(!gestao ? [['finalizadas', 'Finalizadas'] as const] : []),
  ];
  const explicacao = visao === 'substituir'
    ? (perfil.papel === 'direcao'
      ? 'Pedidos que ainda esperam a chefia das unidades. Você não precisa fazer nada aqui. Só use se não houver quem assine (ex.: unidade sem chefia): aí a Direção pode aprovar ou negar direto, explicando o motivo.'
      : 'Pedidos em que a chefia titular não tem ausência registrada. Para assinar no lugar dela, declare o motivo (férias ou afastamento médico); isso fica no histórico.')
    : visao === 'andamento' ? 'Pedidos que esperam a assinatura de outra pessoa.'
    : EXPLICA;

  return (
    <div className={`w-full ${marcadosValidos.length ? 'pb-48 lg:pb-28' : ''}`}>
      <Cabecalho icone={CheckSquare} titulo="Para assinar"
        descricao={`${PAPEIS[perfil.papel].rotulo}${perfil.unidade?.nome && !gestao ? ` | ${perfil.unidade.nome}` : ''}. Os pedidos mais antigos aparecem primeiro.`} />

      <div className="mt-4 sm:mt-6">
        <Segmentos rotulo="Situação" opcoes={VISOES} valor={visao} onChange={(v) => { setVisao(v); setMarcados(new Set()); }}
          contagem={{ voce: grupos.voce.length, substituir: grupos.substituir.length, andamento: grupos.andamento.length }} />
      </div>

      {explicacao && (
        <>
          <p className="mt-3 hidden text-sm text-tinta-suave sm:block">{explicacao}</p>
          <details className="mt-2 text-sm text-tinta-suave sm:hidden">
            <summary className="cursor-pointer py-1 text-xs font-semibold text-electric-cobalt">Como funciona</summary>
            <p className="mt-1">{explicacao}</p>
          </details>
        </>
      )}

      {erro && <div className="mt-4"><Aviso>{erro}</Aviso></div>}
      {ok && <div className="mt-4"><Aviso tom="info">{ok}</Aviso></div>}
      {erroLote && !marcadosValidos.length && <div className="mt-4"><Aviso>{erroLote}</Aviso></div>}

      {visao === 'voce' && elegiveis.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <button type="button"
            onClick={() => setMarcados(marcadosValidos.length === elegiveis.length ? new Set() : new Set(elegiveis.map((s) => s.id)))}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-electric-cobalt/30 bg-white px-4 text-xs font-semibold text-electric-cobalt hover:bg-lavender-mist">
            <CheckCheck className="size-4" aria-hidden />
            {marcadosValidos.length === elegiveis.length ? 'Desmarcar todos' : `Marcar todos (${elegiveis.length})`}
          </button>
          <span className="text-xs text-tinta-suave">Marque vários e assine de uma vez, com uma senha só.</span>
        </div>
      )}

      <div className="mt-4">
        <ListaSolicitacoes
          itens={dados && grupos[visao]}
          mostrarSolicitante
          comUnidade={variasUnidades}
          destaque={(s) => grupos.fila.has(s.id) && visao === 'voce'}
          selecao={visao === 'voce' && elegiveis.length > 1
            ? { pode: (s) => simples(grupos.fila.get(s.id)), marcados, alternar } : undefined}
          vazio={visao === 'voce' ? 'Nada aguardando a sua assinatura. Tudo em dia!'
            : visao === 'substituir' ? (perfil.papel === 'direcao' ? 'Nenhum pedido parado nas unidades.' : 'Nenhum pedido para assinar como substituto.')
            : visao === 'andamento' ? 'Nenhum pedido esperando outra assinatura.' : 'Nenhum pedido finalizado ainda.'}
          acoes={(s) => {
            const item = grupos.fila.get(s.id);
            if (!item || (visao !== 'voce' && visao !== 'substituir')) return null;
            if (marcados.has(s.id)) return <span className="text-xs font-semibold text-electric-cobalt">Marcado para assinar junto</span>;
            return <AcoesAssinatura s={s} item={item} onFeito={(m) => { setOk(m); mostrarRecado(m); recarregar(); }} />;
          }}
        />
      </div>

      {/* Barra para assinar os marcados (fica acima da barra de navegação no celular) */}
      {marcadosValidos.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2 lg:bottom-4 lg:left-72 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-2xl border border-electric-cobalt/30 bg-white p-3 shadow-xl sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-ink-charcoal">
                {marcadosValidos.length} {marcadosValidos.length === 1 ? 'pedido marcado' : 'pedidos marcados'}
              </p>
              <button type="button" onClick={() => setMarcados(new Set())} aria-label="Desmarcar todos"
                className="inline-flex size-9 items-center justify-center rounded-full text-slate-gray hover:bg-faint-gray">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <label className="relative flex-1">
                <span className="sr-only">Sua senha de acesso</span>
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-gray" aria-hidden />
                <input type="password" autoComplete="current-password" value={senhaLote} maxLength={72}
                  onChange={(e) => setSenhaLote(e.target.value)} placeholder="Sua senha para assinar"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !lote) assinarVarios(); }}
                  className="min-h-[44px] w-full rounded-xl border border-linha bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-electric-cobalt focus:ring-2 focus:ring-electric-cobalt/20" />
              </label>
              <button type="button" onClick={assinarVarios} disabled={!!lote}
                className="dock-btn-primary inline-flex min-h-[44px] items-center justify-center gap-2 disabled:opacity-60">
                {lote ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Assinando {lote.feitos + 1} de {lote.total}…</>
                  : <><CheckCheck className="size-4" aria-hidden /> Assinar {marcadosValidos.length}</>}
              </button>
            </div>
            {erroLote && <p role="alert" className="mt-2 text-xs text-danger">{erroLote}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
