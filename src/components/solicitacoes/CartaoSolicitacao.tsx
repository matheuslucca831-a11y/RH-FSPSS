'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Ban, FileSignature, Check, ChevronDown, Clock, ExternalLink, Paperclip, Undo2, X, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { abrirComprovante } from '@/lib/funcoes';
import { dataHoraBR } from '@/lib/formato';
import {
  CATEGORIAS, dataCurta, frase, horarios, linhaDoTempo, periodo, rotuloTipo, type ItemHistorico, type Solicitacao,
} from '@/lib/solicitacoes';
import { Selo } from '@/components/ui';

type Props = {
  s: Solicitacao;
  /** Mostra nome/matrícula de quem pediu (telas de análise) */
  mostrarSolicitante?: boolean;
  /** Botões de ação (aprovar, cancelar, arquivar...) */
  acoes?: ReactNode;
  /** Destaque de borda (ex.: aguardando você) */
  destaque?: boolean;
};

export default function CartaoSolicitacao({ s, mostrarSolicitante = false, acoes, destaque = false }: Props) {
  const passos = linhaDoTempo(s);
  const parou = s.situacao === 'Negado' || s.situacao === 'Cancelado';
  const fim = s.situacao === 'Aprovado';
  const hs = horarios(s);
  const [histAberto, setHistAberto] = useState(false);

  return (
    <article className={`dock-card p-4 sm:p-5 ${destaque ? '!border-electric-cobalt/40 ring-1 ring-electric-cobalt/15' : s.situacao === 'Negado' ? '!border-danger/30' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {mostrarSolicitante ? (
            <>
              <h2 className="text-[15px] font-bold uppercase tracking-tight text-ink-charcoal">{s.solicitante_nome}</h2>
              <p className="text-xs text-tinta-suave">
                Matrícula: {s.solicitante_matricula ?? 'não informada'}{s.solicitante_cargo ? ` | ${s.solicitante_cargo}` : ''}{s.unidade_nome ? ` | ${s.unidade_nome}` : ''}
              </p>
            </>
          ) : (
            <h2 className="text-[15px] font-semibold text-ink-charcoal">{CATEGORIAS[s.categoria].titulo}</h2>
          )}
          <p className="mt-1 text-sm">
            {mostrarSolicitante && <span className="text-tinta-suave">{CATEGORIAS[s.categoria].titulo}: </span>}
            <span className="font-medium">{rotuloTipo(s)}</span>
            <span className="text-tinta-suave"> | {periodo(s)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {s.arquivado && <Selo texto="Arquivada" />}
          <Selo texto={s.situacao} />
          <span className="font-mono text-xs text-tinta-suave">{s.protocolo}</span>
        </div>
      </div>

      {hs.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Horários para ajuste">
          {hs.map((x) => (
            <li key={x.rotulo} className="inline-flex items-center gap-1.5 rounded-full border border-linha bg-faint-gray px-2.5 py-1 text-xs">
              <Clock className="size-3.5 text-tinta-suave" aria-hidden />
              <span className="text-tinta-suave">{x.rotulo}</span> <span className="font-semibold">{x.hora}</span>
            </li>
          ))}
        </ul>
      )}

      {(s.unidade_destino_nome || s.referencia_protocolo || s.gozo_imediato) && (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          {s.unidade_destino_nome && (
            <li className="inline-flex items-center gap-1.5 rounded-full border border-electric-cobalt/20 bg-powder-blue/25 px-2.5 py-1 font-semibold text-electric-cobalt">
              <ArrowLeftRight className="size-3.5" aria-hidden /> Para: {s.unidade_destino_nome}
            </li>
          )}
          {s.referencia_protocolo && (
            <li className="inline-flex items-center gap-1.5 rounded-full border border-linha bg-faint-gray px-2.5 py-1">
              <Undo2 className="size-3.5 text-tinta-suave" aria-hidden /> Cancela o protocolo <span className="font-mono font-semibold">{s.referencia_protocolo}</span>
            </li>
          )}
          {s.gozo_imediato && (
            <li className="inline-flex items-center gap-1.5 rounded-full border border-warning/25 bg-warning-light px-2.5 py-1 font-semibold text-warning">
              <Zap className="size-3.5" aria-hidden /> Gozo imediato
            </li>
          )}
        </ul>
      )}

      {s.justificativa && (
        <p className="mt-3 whitespace-pre-line border-l-2 border-linha pl-3 text-sm text-tinta">{s.justificativa}</p>
      )}

      {/* Linha das etapas */}
      <ol className="mt-4 grid" style={{ gridTemplateColumns: `repeat(${passos.length}, minmax(0, 1fr))` }} aria-label="Andamento do pedido">
        {passos.map((p, k) => {
          const feito = p.estado === 'feito';
          const travou = p.estado === 'negado' || p.estado === 'cancelado';
          const daVez = p.estado === 'atual';
          return (
            <li key={k} className="relative flex flex-col items-center text-center">
              {k > 0 && (
                <span className={`absolute right-1/2 top-3.5 h-0.5 w-full ${feito || daVez ? 'bg-acento' : travou ? 'bg-erro/50' : 'bg-linha'}`} aria-hidden />
              )}
              <span className={`relative z-10 flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                travou ? (p.estado === 'cancelado' ? 'bg-tinta-suave text-white' : 'bg-erro text-white')
                  : feito ? (fim ? 'bg-pinho text-white' : 'bg-acento text-white')
                  : daVez ? 'bg-white text-acento-escuro ring-2 ring-acento'
                  : 'bg-papel text-tinta-suave ring-1 ring-linha'}`}>
                {travou ? (p.estado === 'cancelado' ? <Ban className="size-3.5" /> : <X className="size-3.5" />)
                  : feito ? <Check className="size-3.5" /> : k + 1}
              </span>
              <span className={`mt-1 text-[11px] leading-tight ${daVez || travou ? 'font-bold' : 'text-tinta-suave'}`}>
                {p.estado === 'negado' ? `${p.titulo}: negou` : p.titulo}
              </span>
              {p.detalhe && <span className="max-w-full truncate px-1 text-[10px] text-tinta-suave" title={p.detalhe}>{p.detalhe}</span>}
              {p.data && (feito || travou) && <span className="text-[10px] text-tinta-suave">{dataCurta(p.data)}</span>}
              {daVez && <span className="text-[10px] text-acento-escuro">aguardando</span>}
            </li>
          );
        })}
      </ol>

      {s.assinaturas?.some((a) => a.substituicao) && (
        <ul className="mt-3 space-y-1 text-xs text-tinta-suave">
          {s.assinaturas.filter((a) => a.substituicao).map((a) => (
            <li key={a.criado_em}><strong className="text-mid-graphite">{a.nome}:</strong> {a.substituicao}</li>
          ))}
        </ul>
      )}

      <p className={`mt-4 rounded-xl border px-4 py-2.5 text-sm ${parou ? (s.situacao === 'Negado' ? 'border-danger/20 bg-danger-light text-danger' : 'border-linha bg-faint-gray text-slate-gray') : fim ? 'border-forest/20 bg-forest-light text-forest' : 'border-linha bg-faint-gray text-mid-graphite'}`}>
        {frase(s)}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <Link href={`/comprovante?id=${s.id}`} className={linkCls}>
            <FileSignature className="size-4" aria-hidden /> Documento assinado
          </Link>
          <BotaoAnexo s={s} />
          <button type="button" onClick={() => setHistAberto((v) => !v)} aria-expanded={histAberto} className={linkCls}>
            <ChevronDown className={`size-4 transition-transform ${histAberto ? 'rotate-180' : ''}`} aria-hidden />
            Histórico
          </button>
        </div>
        {acoes && <div className="flex flex-wrap items-center justify-end gap-2">{acoes}</div>}
      </div>
      {histAberto && <Historico id={s.id} />}
    </article>
  );
}

const linkCls = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-gray hover:bg-faint-gray hover:text-ink-charcoal';

/** Abre o comprovante pela Edge Function (confere a permissão e registra quem abriu) */
function BotaoAnexo({ s }: { s: Solicitacao }) {
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  if (!s.anexo_path) return null;

  async function abrir() {
    setErro(null);
    setAbrindo(true);
    setErro(await abrirComprovante(s.id));
    setAbrindo(false);
  }

  return (
    <>
      <button type="button" onClick={abrir} className={linkCls} disabled={abrindo}>
        <Paperclip className="size-4" aria-hidden />
        {s.anexo_bucket === 'anexos' ? 'Anexo (sistema antigo)' : 'Ver anexo'}
        <ExternalLink className="size-3" aria-hidden />
      </button>
      {erro && <span role="alert" className="text-xs text-danger">{erro}</span>}
    </>
  );
}

/** Quem fez o quê e quando (carrega ao abrir) */
function Historico({ id }: { id: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [itens, setItens] = useState<ItemHistorico[] | null>(null);

  useEffect(() => {
    let vivo = true;
    supabase.from('historico').select('id, acao, detalhe, usuario_nome, criado_em')
      .eq('solicitacao_id', id).order('criado_em').order('id')
      .then(({ data }) => vivo && setItens((data as ItemHistorico[]) ?? []));
    return () => {
      vivo = false;
    };
  }, [supabase, id]);

  return (
    <ol className="mt-2 space-y-2 rounded-xl border border-linha bg-faint-gray p-3.5 text-sm" aria-label="Histórico da solicitação">
      {!itens && <li className="text-tinta-suave">Carregando…</li>}
      {itens?.length === 0 && <li className="text-tinta-suave">Sem registros.</li>}
      {itens?.map((h) => (
        <li key={h.id} className="flex flex-wrap gap-x-3">
          <span className="w-32 shrink-0 tabular-nums text-xs leading-5 text-tinta-suave">{dataHoraBR(h.criado_em)}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{h.acao}</span>
            {h.usuario_nome && <span className="text-tinta-suave"> | {h.usuario_nome}</span>}
            {h.detalhe && <span className="block text-tinta-suave">“{h.detalhe}”</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
