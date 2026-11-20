'use client';

import { useMemo, useState } from 'react';
import { CheckCheck, ClipboardCheck, Download, Undo2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarSolicitacoes } from '@/lib/consultas';
import { dataHoraBR, mensagemErro, normalizar } from '@/lib/formato';
import { baixarCSV } from '@/lib/csv';
import { CATEGORIAS, dataCurta, periodo, rotuloEtapa, rotuloTipo, type Categoria, type Solicitacao } from '@/lib/solicitacoes';
import { Aviso, Botao, Cabecalho, Campo, CampoBusca, Segmentos, Vazio, inputCls } from '@/components/ui';
import { Paginacao, usePaginacao } from '@/components/Paginacao';
import Escolha from '@/components/Escolha';

type Visao = 'pendentes' | 'baixados';

/** Etapa final: o RH dá baixa no sistema dele dos pedidos já aprovados (em lote) */
export default function BaixaRH() {
  const supabase = useMemo(() => createClient(), []);
  const [visao, setVisao] = useState<Visao>('pendentes');
  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState<Categoria | ''>('');
  const [unidade, setUnidade] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const { dados, erro: erroCarga, recarregar } = useConsulta('baixa-rh', () =>
    buscarSolicitacoes(supabase, (q) => q.eq('situacao', 'Aprovado'), true));

  const unidades = useMemo(() => [...new Set((dados ?? []).map((s) => s.unidade_nome ?? 'Sem unidade'))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [dados]);
  const aprovadoEm = (s: Solicitacao) => [...(s.assinaturas ?? [])].sort((a, b) => a.criado_em.localeCompare(b.criado_em)).at(-1)?.criado_em ?? s.atualizado_em;

  const visiveis = useMemo(() => {
    const t = normalizar(busca);
    return (dados ?? []).filter((s) =>
      (visao === 'pendentes' ? !s.baixa_em : !!s.baixa_em)
      && (!cat || s.categoria === cat)
      && (!unidade || (s.unidade_nome ?? 'Sem unidade') === unidade)
      && (!de || s.data_fim >= de)
      && (!ate || s.data_inicio <= ate)
      && (!t || normalizar(`${s.solicitante_nome} ${s.solicitante_matricula} ${s.protocolo}`).includes(t)))
      .sort((a, b) => (visao === 'pendentes' ? aprovadoEm(a).localeCompare(aprovadoEm(b)) : (b.baixa_em ?? '').localeCompare(a.baixa_em ?? '')));
  }, [dados, visao, busca, cat, unidade, de, ate]);
  const pag = usePaginacao(visiveis, 50);
  const contagem = useMemo(() => ({
    pendentes: (dados ?? []).filter((s) => !s.baixa_em).length,
    baixados: (dados ?? []).filter((s) => s.baixa_em).length,
  }), [dados]);

  const todosMarcados = visiveis.length > 0 && visiveis.every((s) => marcados.has(s.id));
  function alternar(id: string) {
    setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function darBaixa() {
    const ids = [...marcados];
    setOcupado('lote');
    setErro(null);
    let feitos = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await supabase.rpc('dar_baixa', { p_ids: ids.slice(i, i + 500) });
      if (error) { setErro(mensagemErro(error)); break; }
      feitos += (data as number) ?? 0;
    }
    setOcupado(null);
    setMarcados(new Set());
    if (feitos) setOk(`Baixa registrada em ${feitos} ${feitos === 1 ? 'pedido' : 'pedidos'}.`);
    recarregar();
  }

  async function desfazer(s: Solicitacao) {
    if (!window.confirm(`Desfazer a baixa do protocolo ${s.protocolo}? Ele volta para "Pendentes de baixa".`)) return;
    setOcupado(s.id);
    const { error } = await supabase.rpc('desfazer_baixa', { p_id: s.id });
    setOcupado(null);
    if (error) return setErro(mensagemErro(error));
    setOk(`Baixa do protocolo ${s.protocolo} desfeita.`);
    recarregar();
  }

  function planilha() {
    baixarCSV(`siger-rh-${visao === 'pendentes' ? 'pendentes-de-baixa' : 'baixados'}.csv`,
      ['Protocolo', 'Nome', 'Matrícula', 'Cargo', 'Unidade', 'Pedido', 'Tipo', 'Período', 'Aprovado em', 'Assinaturas', 'Baixa em', 'Baixa por'],
      visiveis.map((s) => [
        s.protocolo, s.solicitante_nome, s.solicitante_matricula, s.solicitante_cargo, s.unidade_nome, CATEGORIAS[s.categoria].titulo, rotuloTipo(s),
        periodo(s), dataCurta(aprovadoEm(s)),
        (s.assinaturas ?? []).map((a) => `${rotuloEtapa(a.etapa)}: ${a.nome}`).join(' | '),
        s.baixa_em ? dataHoraBR(s.baixa_em) : '', s.baixa_nome,
      ]));
  }

  return (
    <div className={`w-full ${marcados.size ? 'pb-40 lg:pb-24' : ''}`}>
      <Cabecalho icone={ClipboardCheck} titulo="Baixa do RH"
        descricao="Pedidos aprovados que precisam ser lançados no sistema do RH. Marque os que você já lançou e dê baixa de uma vez.">
        <Botao variante="secundario" onClick={planilha} disabled={!visiveis.length}>
          <Download className="size-4" aria-hidden /> Planilha
        </Botao>
      </Cabecalho>

      <div className="mt-4 sm:mt-6">
        <Segmentos rotulo="Situação da baixa" valor={visao} onChange={(v) => { setVisao(v); setMarcados(new Set()); }} contagem={contagem}
          opcoes={[['pendentes', 'Pendentes de baixa'], ['baixados', 'Com baixa']] as const} />
      </div>

      <div className="dock-card mt-4 grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-6">
        <Campo rotulo="Buscar" className="sm:col-span-2"><CampoBusca valor={busca} onChange={setBusca} placeholder="Nome, matrícula ou protocolo" /></Campo>
        <Campo rotulo="Pedido">
          <Escolha valor={cat} onChange={(v) => setCat(v as Categoria | '')} vazio="Todos" rotulo="Pedido"
            opcoes={(Object.keys(CATEGORIAS) as Categoria[]).map((c) => ({ valor: c, rotulo: CATEGORIAS[c].titulo }))} />
        </Campo>
        <Campo rotulo="Unidade">
          <Escolha valor={unidade} onChange={setUnidade} vazio="Todas" rotulo="Unidade" placeholder="Digite a unidade"
            opcoes={unidades.map((u) => ({ valor: u, rotulo: u }))} />
        </Campo>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <Campo rotulo="Período de"><input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={inputCls} /></Campo>
          <Campo rotulo="até"><input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} className={inputCls} /></Campo>
        </div>
      </div>

      {(erro || erroCarga) && <div className="mt-4"><Aviso>{erro ?? erroCarga}</Aviso></div>}
      {ok && <div className="mt-4"><Aviso tom="info">{ok}</Aviso></div>}

      {visao === 'pendentes' && visiveis.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <button type="button"
            onClick={() => setMarcados(todosMarcados ? new Set() : new Set(visiveis.map((s) => s.id)))}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-electric-cobalt/30 bg-white px-4 text-xs font-semibold text-electric-cobalt hover:bg-lavender-mist">
            <CheckCheck className="size-4" aria-hidden />
            {todosMarcados ? 'Desmarcar todos' : `Marcar os ${visiveis.length} filtrados`}
          </button>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {!dados ? <p className="text-sm text-tinta-suave">Carregando…</p>
          : visiveis.length === 0 ? <Vazio>{visao === 'pendentes' ? 'Nenhum pedido aprovado esperando baixa.' : 'Nenhum pedido com baixa ainda.'}</Vazio>
          : pag.visiveis.map((s) => (
            <div key={s.id} className={`dock-card flex items-start gap-3 p-3.5 sm:p-4 ${marcados.has(s.id) ? '!border-electric-cobalt ring-2 ring-electric-cobalt/15' : ''}`}>
              {visao === 'pendentes' && (
                <label className="-m-2 flex shrink-0 cursor-pointer p-2">
                  <input type="checkbox" checked={marcados.has(s.id)} onChange={() => alternar(s.id)} aria-label={`Marcar ${s.protocolo}`}
                    className="size-5 accent-electric-cobalt" />
                </label>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-bold text-ink-charcoal">{s.solicitante_nome}</span>
                  <span className="font-mono text-xs text-slate-gray">{s.solicitante_matricula}</span>
                  <span className="font-mono text-xs text-slate-gray">| {s.protocolo}</span>
                </div>
                <p className="mt-0.5 text-sm text-mid-graphite">
                  <strong className="font-semibold">{CATEGORIAS[s.categoria].titulo}</strong>: {rotuloTipo(s)} | {periodo(s)}
                </p>
                <p className="mt-0.5 text-xs text-slate-gray">
                  {[s.unidade_nome, s.solicitante_cargo, `Aprovado em ${dataCurta(aprovadoEm(s))}`].filter(Boolean).join(' | ')}
                  {s.baixa_em && ` | Baixa em ${dataHoraBR(s.baixa_em)} por ${s.baixa_nome ?? ''}`}
                </p>
              </div>
              {visao === 'baixados' && (
                <button type="button" onClick={() => desfazer(s)} disabled={ocupado === s.id}
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-gray hover:bg-faint-gray hover:text-ink-charcoal">
                  <Undo2 className="size-3.5" aria-hidden /> Desfazer
                </button>
              )}
            </div>
          ))}
        {visiveis.length > 0 && <Paginacao p={pag} rotulo="pedidos" />}
      </div>

      {marcados.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2 lg:bottom-4 lg:left-72 lg:px-8">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-electric-cobalt/30 bg-white p-3 shadow-xl sm:p-4">
            <p className="flex-1 text-sm font-bold text-ink-charcoal">
              {marcados.size} {marcados.size === 1 ? 'pedido marcado' : 'pedidos marcados'}
            </p>
            <button type="button" onClick={() => setMarcados(new Set())} aria-label="Desmarcar todos"
              className="inline-flex size-9 items-center justify-center rounded-full text-slate-gray hover:bg-faint-gray">
              <X className="size-4" aria-hidden />
            </button>
            <Botao carregando={ocupado === 'lote'} onClick={darBaixa}>
              <ClipboardCheck className="size-4" aria-hidden /> Dar baixa
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
