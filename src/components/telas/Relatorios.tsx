'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Download, Printer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarSolicitacoes } from '@/lib/consultas';
import { competenciaAtual, fimDoMes, nomeCompetencia } from '@/lib/formato';
import { baixarCSV } from '@/lib/csv';
import { CATEGORIAS, qtdDias, rotuloTipo, type Categoria, type Solicitacao } from '@/lib/solicitacoes';
import { Aviso, Botao, Cabecalho, SeletorMes, TabelaWrap, tdCls, thCls } from '@/components/ui';

type Contagem = { total: number; aprovadas: number; negadas: number; analise: number; canceladas: number; dias: number };
const vazia = (): Contagem => ({ total: 0, aprovadas: 0, negadas: 0, analise: 0, canceladas: 0, dias: 0 });

/** Dias do pedido que caem dentro do mês */
function diasNoMes(s: Solicitacao, ini: string, fim: string) {
  const a = s.data_inicio > ini ? s.data_inicio : ini;
  const b = s.data_fim < fim ? s.data_fim : fim;
  return b >= a ? qtdDias(a, b) : 0;
}

function somar(c: Contagem, s: Solicitacao, dias: number) {
  if (s.situacao === 'Cancelado') { c.canceladas++; return; }
  c.total++;
  if (s.situacao === 'Aprovado') { c.aprovadas++; c.dias += dias; }
  else if (s.situacao === 'Negado') c.negadas++;
  else c.analise++;
}

export default function Relatorios() {
  const supabase = useMemo(() => createClient(), []);
  const [mes, setMes] = useState(competenciaAtual());
  const fim = fimDoMes(mes);

  // Pedidos cujo período toca o mês escolhido
  const { dados, erro, atualizando } = useConsulta(`relatorio:${mes}`, () =>
    buscarSolicitacoes(supabase, (q) => q.lte('data_inicio', fim).gte('data_fim', mes), true), [mes]);

  const r = useMemo(() => {
    const porCat: Record<Categoria, Contagem> = { ponto: vazia(), folga: vazia() };
    const porUnidade = new Map<string, Record<Categoria, Contagem>>();
    const porTipo = new Map<string, Contagem & { categoria: Categoria }>();
    const porPessoa = new Map<string, { nome: string; matricula: string | null; unidade: string | null; pedidos: number; dias: number }>();

    for (const s of dados ?? []) {
      const d = diasNoMes(s, mes, fim);
      somar(porCat[s.categoria], s, d);

      const u = s.unidade_nome ?? 'Sede';
      if (!porUnidade.has(u)) porUnidade.set(u, { ponto: vazia(), folga: vazia() });
      somar(porUnidade.get(u)![s.categoria], s, d);

      const t = `${s.categoria}|${rotuloTipo(s)}`;
      if (!porTipo.has(t)) porTipo.set(t, { ...vazia(), categoria: s.categoria });
      somar(porTipo.get(t)!, s, d);

      if (s.situacao !== 'Cancelado') {
        const p = porPessoa.get(s.solicitante_id) ?? { nome: s.solicitante_nome, matricula: s.solicitante_matricula, unidade: s.unidade_nome, pedidos: 0, dias: 0 };
        p.pedidos++;
        if (s.situacao === 'Aprovado') p.dias += d;
        porPessoa.set(s.solicitante_id, p);
      }
    }
    return {
      porCat,
      unidades: [...porUnidade.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')),
      tipos: [...porTipo.entries()].map(([k, v]) => ({ tipo: k.split('|')[1], ...v }))
        .sort((a, b) => a.categoria.localeCompare(b.categoria) || b.total - a.total),
      pessoas: [...porPessoa.values()].sort((a, b) => b.pedidos - a.pedidos || b.dias - a.dias).slice(0, 10),
    };
  }, [dados, mes, fim]);

  function exportar() {
    baixarCSV(`relatorio-rh-${mes.slice(0, 7)}.csv`,
      ['Protocolo', 'Funcionário', 'Matrícula', 'Unidade', 'Pedido', 'Tipo', 'Início', 'Fim', 'Dias no mês', 'Situação'],
      (dados ?? []).map((s) => [s.protocolo, s.solicitante_nome, s.solicitante_matricula, s.unidade_nome,
        CATEGORIAS[s.categoria].titulo, rotuloTipo(s), s.data_inicio, s.data_fim, diasNoMes(s, mes, fim), s.situacao]));
  }

  return (
    <div className="w-full">
      <Cabecalho icone={BarChart3} titulo="Relatórios" descricao={`Pedidos com datas em ${nomeCompetencia(mes).toLowerCase()}. Pedidos cancelados não entram nos totais.`}>
        <div className="flex flex-wrap gap-2 print:hidden">
          <SeletorMes valor={mes} onChange={setMes} />
          <Botao variante="secundario" onClick={exportar} disabled={!dados?.length}><Download className="size-4" aria-hidden /> CSV</Botao>
          <Botao variante="secundario" onClick={() => window.print()}><Printer className="size-4" aria-hidden /> Imprimir</Botao>
        </div>
      </Cabecalho>

      {erro && <div className="mt-4"><Aviso>{erro}</Aviso></div>}

      <div className={`transition-opacity ${atualizando || !dados ? 'opacity-60' : ''}`}>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {(['folga', 'ponto'] as Categoria[]).map((c) => {
            const k = r.porCat[c];
            return (
              <section key={c} className="dock-card p-5 sm:p-6">
                <h2 className="text-sm font-bold">{CATEGORIAS[c].titulo === 'Folga' ? 'Folgas' : 'Ajustes de ponto'}</h2>
                <dl className="mt-3 grid grid-cols-4 gap-3">
                  <Numero rotulo="Pedidos" valor={k.total} grande />
                  <Numero rotulo="Aprovados" valor={k.aprovadas} />
                  <Numero rotulo="Negados" valor={k.negadas} />
                  <Numero rotulo="Em análise" valor={k.analise} />
                </dl>
                <p className="mt-3 text-xs text-tinta-suave">
                  {c === 'folga' ? `${k.dias} ${k.dias === 1 ? 'dia' : 'dias'} de folga aprovados no mês` : `${k.dias} ${k.dias === 1 ? 'dia' : 'dias'} com ajuste aprovado`}
                  {k.canceladas > 0 && ` | ${k.canceladas} cancelado${k.canceladas > 1 ? 's' : ''}`}
                </p>
              </section>
            );
          })}
        </div>

        <h2 className="mt-8 text-lg font-bold">Por unidade</h2>
        <div className="mt-3">
          <TabelaWrap>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={thCls}>Unidade</th>
                  <th className={`${thCls} text-right`}>Folgas</th><th className={`${thCls} text-right`}>Dias de folga</th>
                  <th className={`${thCls} text-right`}>Ajustes de ponto</th>
                  <th className={`${thCls} text-right`}>Aprovados</th><th className={`${thCls} text-right`}>Negados</th>
                  <th className={`${thCls} text-right`}>Em análise</th>
                </tr>
              </thead>
              <tbody>
                {r.unidades.length === 0 && <tr><td colSpan={7} className={`${tdCls} text-tinta-suave`}>{dados ? 'Nenhum pedido neste mês.' : 'Carregando…'}</td></tr>}
                {r.unidades.map(([u, k]) => (
                  <tr key={u} className="hover:bg-papel/50">
                    <td className={`${tdCls} font-medium`}>{u}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{k.folga.total}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{k.folga.dias}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{k.ponto.total}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{k.folga.aprovadas + k.ponto.aprovadas}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{k.folga.negadas + k.ponto.negadas}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{k.folga.analise + k.ponto.analise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaWrap>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <section>
            <h2 className="text-lg font-bold">Por tipo</h2>
            <div className="mt-3">
              <TabelaWrap>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={thCls}>Tipo</th><th className={`${thCls} text-right`}>Pedidos</th>
                      <th className={`${thCls} text-right`}>Aprovados</th><th className={`${thCls} text-right`}>Negados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.tipos.length === 0 && <tr><td colSpan={4} className={`${tdCls} text-tinta-suave`}>Nenhum pedido neste mês.</td></tr>}
                    {r.tipos.map((t) => (
                      <tr key={`${t.categoria}${t.tipo}`} className="hover:bg-papel/50">
                        <td className={tdCls}><span className="text-xs text-tinta-suave">{CATEGORIAS[t.categoria].titulo}: </span>{t.tipo}</td>
                        <td className={`${tdCls} text-right tabular-nums`}>{t.total}</td>
                        <td className={`${tdCls} text-right tabular-nums`}>{t.aprovadas}</td>
                        <td className={`${tdCls} text-right tabular-nums`}>{t.negadas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabelaWrap>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold">Quem mais pediu no mês</h2>
            <div className="mt-3">
              <TabelaWrap>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={thCls}>Funcionário</th><th className={thCls}>Unidade</th>
                      <th className={`${thCls} text-right`}>Pedidos</th><th className={`${thCls} text-right`}>Dias aprovados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.pessoas.length === 0 && <tr><td colSpan={4} className={`${tdCls} text-tinta-suave`}>Nenhum pedido neste mês.</td></tr>}
                    {r.pessoas.map((p) => (
                      <tr key={`${p.nome}${p.matricula}`} className="hover:bg-papel/50">
                        <td className={tdCls}>{p.nome}<span className="block text-xs text-tinta-suave">Matrícula: {p.matricula ?? 'não informada'}</span></td>
                        <td className={tdCls}>{p.unidade ?? 'Sede'}</td>
                        <td className={`${tdCls} text-right tabular-nums`}>{p.pedidos}</td>
                        <td className={`${tdCls} text-right tabular-nums`}>{p.dias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabelaWrap>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, grande = false }: { rotulo: string; valor: number; grande?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-tinta-suave">{rotulo}</dt>
      <dd className={`mt-0.5 font-bold tabular-nums ${grande ? 'text-3xl' : 'text-2xl text-tinta'}`}>{valor}</dd>
    </div>
  );
}
