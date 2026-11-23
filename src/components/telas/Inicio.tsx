'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, DoorOpen, Fingerprint, PlusCircle, TreePalm } from 'lucide-react';
import { iniciais } from '@/components/Shell';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarFila } from '@/lib/fila';
import { competenciaAtual } from '@/lib/formato';
import { CATEGORIAS, dataCurta, periodo, rotuloTipo, type Solicitacao } from '@/lib/solicitacoes';
import { PAPEIS, type Perfil } from '@/lib/types';
import { Aviso, Selo, TabelaWrap, tdCls, thCls } from '@/components/ui';

type Painel = {
  ultimos: Solicitacao[];
  minhasAbertas: number;
  paraAssinar: number | null;
  substituicao: number | null;
  paradasNaChefia: number | null;
  noMes: number | null;
  semBaixa: number | null;
};

export default function Inicio({ perfil }: { perfil: Perfil }) {
  const supabase = useMemo(() => createClient(), []);
  const { dados, erro } = useConsulta<Painel>(`inicio:${perfil.id}`, async () => {
    const conta = () => supabase.from('solicitacoes').select('id', { count: 'exact', head: true });
    const assina = true;
    const gestao = perfil.papel === 'direcao' || perfil.papel === 'coordenacao';
    const rh = perfil.papel === 'rh' || perfil.papel === 'direcao';
    const [ult, abertas, fila, parada, mes, baixa] = await Promise.all([
      supabase.from('solicitacoes').select('id, protocolo, categoria, tipo, subtipo, data_inicio, data_fim, situacao, criado_em')
        .eq('solicitante_id', perfil.id).order('criado_em', { ascending: false }).limit(5),
      conta().eq('solicitante_id', perfil.id).like('situacao', 'Aguardando%'),
      assina ? buscarFila(supabase).catch(() => []) : null,
      gestao ? conta().eq('situacao', 'Aguardando assinatura').eq('etapa_atual', 0) : null,
      gestao ? conta().gte('criado_em', competenciaAtual()) : null,
      rh ? conta().eq('situacao', 'Aprovado').is('baixa_em', null) : null,
    ]);
    if (ult.error) throw new Error(ult.error.message);
    return {
      ultimos: (ult.data ?? []) as unknown as Solicitacao[],
      minhasAbertas: abertas.count ?? 0,
      paraAssinar: fila ? fila.filter((i) => !i.precisa_motivo).length : null,
      substituicao: fila ? fila.filter((i) => i.precisa_motivo).length : null,
      paradasNaChefia: parada?.count ?? null,
      noMes: mes?.count ?? null,
      semBaixa: baixa?.count ?? null,
    };
  });

  const primeiroNome = perfil.nome.split(' ')[0];
  const local = perfil.unidade?.nome ?? (perfil.papel === 'funcionario' ? undefined : 'Sede');

  // Quem assina pedidos (o RH só dá baixa; se um dia tiver algo para assinar, o destaque aparece mesmo assim)
  const chefia = perfil.papel !== 'funcionario' && perfil.papel !== 'rh';
  const direcao = perfil.papel === 'direcao';
  const gestao = direcao || perfil.papel === 'coordenacao';
  const n = (v: number | null | undefined) => v ?? 0;
  const plural = (v: number, um: string, varios: string) => (v === 1 ? um : varios);
  const pendentes = n(dados?.paraAssinar);

  // Números de apoio, com frases simples (o principal, assinar, fica no destaque lá em cima)
  const blocos: { rotulo: string; valor: number | null | undefined; href: string; texto: string }[] = [
    ...(dados?.substituicao && !direcao ? [{ rotulo: 'Para assinar no lugar de quem está ausente', valor: dados.substituicao, href: '/aprovacoes', texto: 'Ver pedidos' }] : []),
    ...(gestao ? [
      { rotulo: 'Ainda com a chefia das unidades', valor: dados?.paradasNaChefia, href: '/todas', texto: 'Acompanhar' },
      { rotulo: 'Pedidos feitos neste mês', valor: dados?.noMes, href: '/relatorios', texto: 'Ver relatório' },
    ] : []),
    ...(perfil.papel === 'rh' || direcao ? [{ rotulo: 'Aprovados esperando baixa do RH', valor: dados?.semBaixa, href: '/baixa', texto: 'Dar baixa' }] : []),
    { rotulo: 'Seus pedidos em análise', valor: dados?.minhasAbertas, href: '/minhas', texto: 'Acompanhar' },
  ];

  const atalhos = (['ponto', 'folga', 'ferias', 'saida'] as const).map((c) => ({
    c, Icone: { ponto: Fingerprint, folga: CalendarClock, ferias: TreePalm, saida: DoorOpen }[c],
    titulo: { ponto: 'Ocorrência de ponto', folga: 'Pedir folga', ferias: 'Pedir férias', saida: 'Saída antecipada' }[c],
  }));

  return (
    <div className="w-full space-y-6">
      <div className="dock-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-electric-cobalt/25 bg-powder-blue/40 text-sm font-extrabold text-electric-cobalt">
            {iniciais(perfil.nome)}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink-charcoal sm:text-2xl">Olá, {primeiroNome}</h1>
            <p className="mt-0.5 text-sm text-slate-gray">{PAPEIS[perfil.papel].rotulo}{local ? ` | ${local}` : ''}</p>
          </div>
        </div>
        {!chefia && <Link href="/nova" className="dock-btn-primary self-start sm:self-auto"><PlusCircle className="size-4" aria-hidden /> Nova solicitação</Link>}
      </div>

      {erro && <Aviso>{erro}</Aviso>}

      {/* O que mais importa para quem assina: aparece primeiro */}
      {(chefia || pendentes > 0) && (
        !dados ? <div className="dock-card h-28 animate-pulse" aria-hidden />
        : pendentes > 0 ? (
          <Link href="/aprovacoes"
            className="flex flex-col gap-4 rounded-3xl bg-electric-cobalt p-5 text-white shadow-lg transition-colors hover:bg-deep-cobalt sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <span className="flex items-center gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-3xl font-bold tabular-nums">{pendentes}</span>
              <span>
                <span className="block text-lg font-bold leading-tight">
                  {plural(pendentes, `pedido espera a sua ${direcao ? 'decisão' : 'assinatura'}`, `pedidos esperam a sua ${direcao ? 'decisão' : 'assinatura'}`)}
                </span>
                <span className="mt-0.5 block text-sm text-white/80">Os mais antigos aparecem primeiro.</span>
              </span>
            </span>
            <span className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-white px-6 text-base font-bold text-electric-cobalt">
              {direcao ? 'Ver agora' : 'Assinar agora'} <ArrowRight className="size-5" aria-hidden />
            </span>
          </Link>
        ) : (
          <div className="dock-card flex items-center gap-4 p-5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-forest-light text-forest"><CheckCircle2 className="size-6" aria-hidden /></span>
            <span>
              <span className="block font-semibold text-ink-charcoal">Nada esperando a sua assinatura</span>
              <span className="block text-sm text-slate-gray">Tudo em dia! Quando chegar um pedido, ele aparece aqui.</span>
            </span>
          </div>
        )
      )}

      {chefia ? (
        // Chefia também pede, mas é a tarefa secundária: atalhos menores
        <section aria-label="Fazer um pedido" className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-gray">Fazer um pedido seu</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {atalhos.map(({ c, Icone, titulo }) => (
              <Link key={c} href={`/nova?tipo=${c}`}
                className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-linha bg-white px-3 py-2.5 text-sm font-semibold text-ink-charcoal transition-colors hover:border-electric-cobalt/40">
                <Icone className="size-5 shrink-0 text-electric-cobalt" aria-hidden />
                <span className="min-w-0 leading-tight">{titulo}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {atalhos.map(({ c, Icone, titulo }) => (
            <Link key={c} href={`/nova?tipo=${c}`}
              className="dock-card group flex items-center gap-4 p-5 transition-all hover:border-electric-cobalt/40">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-lavender-mist text-electric-cobalt">
                <Icone className="size-6" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-charcoal">{titulo}</span>
                <span className="block text-sm text-slate-gray">{CATEGORIAS[c].descricao}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-slate-gray transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ))}
        </div>
      )}

      <dl className={`grid gap-3 sm:gap-4 ${blocos.length >= 3 ? 'grid-cols-2 lg:grid-cols-4' : blocos.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {blocos.map((b) => (
          <Link key={b.rotulo} href={b.href} className="dock-card flex flex-col p-4 transition-all hover:border-electric-cobalt/40 sm:p-5">
            <dd className="order-1 text-2xl font-bold tabular-nums text-ink-charcoal sm:text-3xl">
              {b.valor ?? <span className="inline-block h-8 w-10 animate-pulse rounded bg-linha/60 align-middle" />}
            </dd>
            <dt className="order-2 mt-1 text-sm leading-snug text-mid-graphite">{b.rotulo}</dt>
            <dd className="order-3 mt-auto inline-flex items-center gap-1 pt-2 text-xs font-semibold text-electric-cobalt">{b.texto} <ArrowRight className="size-3.5" aria-hidden /></dd>
          </Link>
        ))}
      </dl>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink-charcoal">Meus últimos pedidos</h2>
          <Link href="/minhas" className="text-sm font-semibold text-electric-cobalt hover:underline">Ver todos</Link>
        </div>
        <ul className="space-y-2.5 sm:hidden">
          {dados?.ultimos.length === 0 && <li className="dock-card p-5 text-sm text-slate-gray">Você ainda não fez nenhum pedido.</li>}
          {dados?.ultimos.map((s) => (
            <li key={s.id} className="dock-card space-y-1.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-gray">{s.protocolo}</span>
                <Selo texto={s.situacao} />
              </div>
              <p className="text-sm font-medium text-ink-charcoal">{CATEGORIAS[s.categoria].titulo}: {rotuloTipo(s)}</p>
              <p className="text-xs text-slate-gray">{periodo(s)} | enviado em {dataCurta(s.criado_em)}</p>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block"><TabelaWrap>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>Protocolo</th><th className={thCls}>Pedido</th>
                <th className={thCls}>Período</th><th className={thCls}>Enviado em</th><th className={thCls}>Situação</th>
              </tr>
            </thead>
            <tbody>
              {!dados && <tr><td colSpan={5} className={`${tdCls} text-slate-gray`}>Carregando…</td></tr>}
              {dados?.ultimos.length === 0 && (
                <tr><td colSpan={5} className={`${tdCls} text-slate-gray`}>Você ainda não fez nenhum pedido.</td></tr>
              )}
              {dados?.ultimos.map((s) => (
                <tr key={s.id} className="hover:bg-faint-gray">
                  <td className={`${tdCls} whitespace-nowrap font-mono text-xs`}>{s.protocolo}</td>
                  <td className={tdCls}><span className="text-slate-gray">{CATEGORIAS[s.categoria].titulo}:</span> {rotuloTipo(s)}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{periodo(s)}</td>
                  <td className={tdCls}>{dataCurta(s.criado_em)}</td>
                  <td className={tdCls}><Selo texto={s.situacao} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaWrap></div>
      </section>
    </div>
  );
}
