import { Fragment } from 'react';
import { ArrowDown, ArrowRight, CheckCircle2, Send, UserRound, UserRoundCog, Users, Zap } from 'lucide-react';
import { rotuloVaga, type Etapa } from '@/lib/solicitacoes';

/**
 * Desenho do caminho de assinaturas: pedido enviado → etapas → aprovado.
 * Grande: de cima para baixo no celular e da esquerda para a direita no computador.
 * Compacto: uma linha que quebra, para os cartões da lista.
 */
export default function DiagramaCaminho({ etapas, nomes, compacto = false }: {
  etapas: Etapa[]; nomes?: Record<string, string>; compacto?: boolean;
}) {
  if (compacto) {
    return (
      <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Caminho das assinaturas">
        <li className="inline-flex items-center gap-1 rounded-full bg-faint-gray px-2.5 py-1 font-semibold text-slate-gray">
          <Send className="size-3" aria-hidden /> Pedido
        </li>
        {etapas.map((e, i) => (
          <Fragment key={i}>
            <li aria-hidden><ArrowRight className="size-3.5 text-steel-gray" /></li>
            <li className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-electric-cobalt/25 bg-lavender-mist/60 px-2.5 py-1 text-ink-charcoal">
              <span className="sr-only">Etapa {i + 1}: </span>
              {e.vagas.map((v, k) => (
                <Fragment key={k}>
                  {k > 0 && <span className="text-slate-gray">{e.regra === 'um' ? 'ou' : '+'}</span>}
                  <span className="font-semibold">{rotuloVaga(v, nomes)}</span>
                </Fragment>
              ))}
              {e.substituto && (
                <span className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-violet-300 bg-white px-1.5 text-[11px] text-violet-700"
                  title={`Na ausência: ${rotuloVaga(e.substituto, nomes)}`}>
                  <UserRoundCog className="size-3" aria-hidden /> {rotuloVaga(e.substituto, nomes)}
                </span>
              )}
            </li>
          </Fragment>
        ))}
        <li aria-hidden><ArrowRight className="size-3.5 text-steel-gray" /></li>
        <li className="inline-flex items-center gap-1 rounded-full bg-forest-light px-2.5 py-1 font-semibold text-forest">
          <CheckCircle2 className="size-3" aria-hidden /> Aprovado
        </li>
      </ol>
    );
  }

  const seta = (
    <li aria-hidden className="flex shrink-0 items-center justify-center py-1 lg:px-1 lg:py-0">
      <ArrowDown className="size-5 text-steel-gray lg:hidden" />
      <ArrowRight className="hidden size-5 text-steel-gray lg:block" />
    </li>
  );

  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex flex-col items-stretch lg:min-w-max lg:flex-row lg:items-center" aria-label="Caminho das assinaturas">
        <li className="flex items-center gap-2 self-center rounded-full border border-linha bg-white px-4 py-2 text-sm font-semibold text-mid-graphite shadow-xs">
          <Send className="size-4 text-electric-cobalt" aria-hidden /> Pedido enviado
        </li>

        {etapas.map((e, i) => {
          const varios = e.vagas.length > 1;
          return (
            <Fragment key={i}>
              {seta}
              <li className="w-full rounded-2xl border-2 border-electric-cobalt/25 bg-white p-3.5 shadow-xs lg:w-56">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-electric-cobalt text-[11px] font-bold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-charcoal" title={e.nome}>{e.nome || 'Sem nome'}</span>
                </div>
                {varios && (
                  <p className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    e.regra === 'um' ? 'bg-warning-light text-warning' : 'bg-lavender-mist text-electric-cobalt'}`}>
                    <Users className="size-3" aria-hidden /> {e.regra === 'um' ? 'Basta um assinar' : 'Todos assinam'}
                  </p>
                )}
                <ul className="mt-2 space-y-1">
                  {e.vagas.map((v, k) => (
                    <li key={k}>
                      {k > 0 && <span className="block pl-7 text-[11px] font-semibold text-slate-gray">{e.regra === 'um' ? 'ou' : 'e'}</span>}
                      <span className="flex items-center gap-2 text-sm text-ink-charcoal">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-lavender-mist text-electric-cobalt">
                          <UserRound className="size-3" aria-hidden />
                        </span>
                        <span className="min-w-0">{rotuloVaga(v, nomes) || 'Escolha quem assina'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {e.substituto && (
                  <p className="mt-2.5 flex items-start gap-1.5 rounded-xl border border-dashed border-violet-300 bg-violet-50/60 px-2.5 py-1.5 text-xs text-violet-800">
                    <UserRoundCog className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>Se estiver de férias ou afastado: <strong>{rotuloVaga(e.substituto, nomes)}</strong> assina no lugar</span>
                  </p>
                )}
                {e.gozo_imediato && e.regra === 'todos' && e.vagas.length === 2 && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-warning">
                    <Zap className="mt-0.5 size-3 shrink-0" aria-hidden /> Folga urgente: um pode assinar pelos dois
                  </p>
                )}
              </li>
            </Fragment>
          );
        })}

        {seta}
        <li className="flex items-center gap-2 self-center rounded-full border border-forest/25 bg-forest-light px-4 py-2 text-sm font-semibold text-forest">
          <CheckCircle2 className="size-4" aria-hidden /> Aprovado
        </li>
      </ol>
      <p className="mt-2 text-center text-xs text-slate-gray lg:text-left">Depois de aprovado, o RH dá baixa. Se alguém negar, o pedido para ali e a pessoa vê o motivo.</p>
    </div>
  );
}
