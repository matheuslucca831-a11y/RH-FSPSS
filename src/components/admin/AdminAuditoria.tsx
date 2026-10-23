'use client';

import { useMemo, useState } from 'react';
import { Download, FileSearch } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarTudo } from '@/lib/buscarTudo';
import { dataHoraBR, hojeISO, normalizar, somarDias } from '@/lib/formato';
import { baixarCSV } from '@/lib/csv';
import { Aviso, Botao, Campo, CampoBusca, TabelaWrap, inputCls, tdCls, thCls } from '@/components/ui';
import { Paginacao, usePaginacao } from '@/components/Paginacao';

type Registro = {
  id: number; criado_em: string; usuario_nome: string | null; acao: string; alvo_tipo: string | null; alvo_nome: string | null;
  detalhe: Record<string, unknown> | null;
};

const ROTULO_CAMPO: Record<string, string> = {
  nome: 'nome', matricula: 'matrícula', cargo: 'cargo', papel: 'acesso', unidade_id: 'unidade', ativo: 'ativo', sigla: 'sigla', ativa: 'ativa',
  exigir_mfa_direcao: 'duas etapas da Direção', exigir_mfa_chefia: 'duas etapas da Chefia', minutos_inatividade: 'minutos sem uso',
  limite_pedidos_dia: 'limite por dia', solicitante: 'de', apps_removidos: 'apps removidos', tinha_anexo: 'tinha comprovante', tipo: 'tipo', periodo: 'período', situacao: 'situação',
};

/** Texto curto do detalhe (o que mudou, de quê para quê) */
function resumo(d: Record<string, unknown> | null) {
  if (!d) return '';
  return Object.entries(d).slice(0, 6).map(([k, v]) => {
    if (k === 'proprio') return v ? 'o próprio pedido' : 'pedido de outra pessoa';
    const nome = ROTULO_CAMPO[k] ?? k.replace(/_/g, ' ');
    if (v && typeof v === 'object' && 'antes' in (v as object)) {
      const x = v as { antes: unknown; depois: unknown };
      return `${nome}: ${fmt(x.antes)} para ${fmt(x.depois)}`;
    }
    return `${nome}: ${fmt(v)}`;
  }).join(' | ');
}
const PAPEL: Record<string, string> = { funcionario: 'Funcionário', chefia: 'Chefia da unidade', direcao: 'Direção' };
let NOMES_UNIDADES: Record<string, string> = {};
const fmt = (v: unknown) => {
  if (v === null || v === undefined || v === '') return 'vazio';
  if (v === true) return 'sim';
  if (v === false) return 'não';
  const t = String(v);
  return NOMES_UNIDADES[t] ?? PAPEL[t] ?? t;
};

export default function AdminAuditoria() {
  const supabase = useMemo(() => createClient(), []);
  const [de, setDe] = useState(somarDias(hojeISO(), -30));
  const [ate, setAte] = useState(hojeISO());
  const [busca, setBusca] = useState('');
  const [acao, setAcao] = useState('');

  const { dados, erro, atualizando } = useConsulta(`auditoria:${de}:${ate}`, async () => {
    const r = await buscarTudo<Registro>((i, f) => supabase.from('auditoria')
      .select('id, criado_em, usuario_nome, acao, alvo_tipo, alvo_nome, detalhe')
      .gte('criado_em', `${de}T00:00:00-03:00`).lte('criado_em', `${ate}T23:59:59-03:00`)
      .order('criado_em', { ascending: false }).order('id', { ascending: false }).range(i, f));
    if (r.error) throw new Error(r.error.message ?? 'Erro ao carregar a auditoria.');
    return r.data ?? [];
  }, [de, ate]);

  const { dados: unidades } = useConsulta('auditoria:unidades', async () => {
    const { data } = await supabase.from('unidades').select('id, nome');
    return Object.fromEntries(((data ?? []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]));
  });
  NOMES_UNIDADES = unidades ?? {};

  const acoes = useMemo(() => [...new Set((dados ?? []).map((r) => r.acao))].sort(), [dados]);
  const visiveis = useMemo(() => {
    const t = normalizar(busca);
    return (dados ?? []).filter((r) => (!acao || r.acao === acao)
      && (!t || normalizar(`${r.usuario_nome} ${r.acao} ${r.alvo_nome} ${JSON.stringify(r.detalhe ?? {})}`).includes(t)));
  }, [dados, busca, acao]);
  const pag = usePaginacao(visiveis, 50);

  return (
    <div className="space-y-5">
      <div className="dock-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-electric-cobalt text-white shadow-xs"><FileSearch className="size-6" aria-hidden /></div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink-charcoal">Auditoria</h2>
            <p className="mt-0.5 text-xs text-slate-gray">Entradas no sistema, trocas de senha, acessos criados ou alterados, comprovantes abertos e exclusões. Ninguém consegue apagar estes registros.</p>
          </div>
        </div>
        <Botao variante="secundario" className="shrink-0 whitespace-nowrap" disabled={!visiveis.length}
          onClick={() => baixarCSV(`auditoria-${de}-a-${ate}.csv`, ['Data e hora', 'Quem', 'Ação', 'Sobre', 'Detalhe'],
            visiveis.map((r) => [dataHoraBR(r.criado_em), r.usuario_nome, r.acao, r.alvo_nome, resumo(r.detalhe)]))}>
          <Download className="size-4" aria-hidden /> Baixar CSV
        </Botao>
      </div>

      <div className="dock-card grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-6">
        <Campo rotulo="Buscar" className="sm:col-span-2"><CampoBusca valor={busca} onChange={setBusca} placeholder="Pessoa, ação ou detalhe" /></Campo>
        <Campo rotulo="Ação" className="lg:col-span-2">
          <select value={acao} onChange={(e) => setAcao(e.target.value)} className={inputCls}>
            <option value="">Todas</option>
            {acoes.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Campo>
        <Campo rotulo="De"><input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value || de)} className={inputCls} /></Campo>
        <Campo rotulo="Até"><input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value || ate)} className={inputCls} /></Campo>
      </div>

      {erro && <Aviso>{erro}</Aviso>}

      <ul className="space-y-2.5 md:hidden">
        {pag.visiveis.map((r) => (
          <li key={r.id} className="dock-card space-y-1 p-4 text-sm">
            <p className="text-xs text-slate-gray">{dataHoraBR(r.criado_em)} | {r.usuario_nome ?? 'Sistema'}</p>
            <p className="font-semibold text-ink-charcoal">{r.acao}{r.alvo_nome ? `: ${r.alvo_nome}` : ''}</p>
            {r.detalhe && <p className="text-xs text-slate-gray">{resumo(r.detalhe)}</p>}
          </li>
        ))}
      </ul>
      <div className={`hidden transition-opacity md:block ${atualizando ? 'opacity-70' : ''}`}>
        <TabelaWrap>
          <table className="w-full text-sm">
            <thead>
              <tr><th className={thCls}>Data e hora</th><th className={thCls}>Quem</th><th className={thCls}>Ação</th><th className={thCls}>Sobre</th><th className={thCls}>Detalhe</th></tr>
            </thead>
            <tbody>
              {!dados && <tr><td colSpan={5} className={`${tdCls} text-slate-gray`}>Carregando…</td></tr>}
              {dados && visiveis.length === 0 && <tr><td colSpan={5} className={`${tdCls} py-8 text-center text-slate-gray`}>Nenhum registro no período.</td></tr>}
              {pag.visiveis.map((r) => (
                <tr key={r.id} className="align-top hover:bg-faint-gray">
                  <td className={`${tdCls} whitespace-nowrap text-xs tabular-nums`}>{dataHoraBR(r.criado_em)}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{r.usuario_nome ?? 'Sistema'}</td>
                  <td className={`${tdCls} font-medium`}>{r.acao}</td>
                  <td className={tdCls}>{r.alvo_nome ?? ''}</td>
                  <td className={`${tdCls} max-w-md text-xs text-slate-gray`}>{resumo(r.detalhe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaWrap>
        <Paginacao p={pag} rotulo="registros" />
      </div>
    </div>
  );
}
