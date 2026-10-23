'use client';

import { Fragment, useMemo, useState } from 'react';
import { Archive, ChevronDown, Download, Table2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarSolicitacoes } from '@/lib/consultas';
import { normalizar } from '@/lib/formato';
import { baixarCSV } from '@/lib/csv';
import {
  CATEGORIAS, SITUACOES, dataCurta, periodo, rotuloTipo, type Categoria, type Situacao, type Solicitacao,
} from '@/lib/solicitacoes';
import { Aviso, Botao, Cabecalho, CampoBusca, Campo, Selo, TabelaWrap, inputCls, tdCls, thCls } from '@/components/ui';
import { Paginacao, usePaginacao } from '@/components/Paginacao';
import CartaoSolicitacao from '@/components/solicitacoes/CartaoSolicitacao';
import { AcaoArquivar, AcaoExcluir, AcoesDecisao } from '@/components/solicitacoes/Acoes';

/** Direção: tabela de todas as solicitações (ou do arquivo) com filtros */
export default function TodasSolicitacoes({ usuarioId, arquivo = false }: { usuarioId: string; arquivo?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [ok, setOk] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const q = useSearchParams().get('q');
  const [busca, setBusca] = useState(q ?? '');
  const [situacao, setSituacao] = useState<Situacao | ''>('');
  const [cat, setCat] = useState<Categoria | ''>('');
  const [unidade, setUnidade] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  const { dados, erro, atualizando, recarregar } = useConsulta(arquivo ? 'arquivo' : 'todas', () =>
    buscarSolicitacoes(supabase, (q) => q.eq('arquivado', arquivo)));

  const unidades = useMemo(
    () => [...new Set((dados ?? []).map((s) => s.unidade_nome ?? 'Sem unidade'))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [dados],
  );

  const visiveis = useMemo(() => {
    const t = normalizar(busca);
    return (dados ?? []).filter((s) =>
      (!situacao || s.situacao === situacao)
      && (!cat || s.categoria === cat)
      && (!unidade || (s.unidade_nome ?? 'Sem unidade') === unidade)
      && (!de || s.data_fim >= de)
      && (!ate || s.data_inicio <= ate)
      && (!t || normalizar(`${s.solicitante_nome} ${s.solicitante_matricula} ${s.protocolo}`).includes(t)));
  }, [dados, busca, situacao, cat, unidade, de, ate]);
  const pag = usePaginacao(visiveis, 50);
  const filtrando = !!(busca || situacao || cat || unidade || de || ate);

  function feito(m: string) {
    setOk(m);
    setAberta(null);
    recarregar();
  }

  function exportar() {
    baixarCSV(`${arquivo ? 'arquivo' : 'solicitacoes'}-rh.csv`,
      ['Protocolo', 'Funcionário', 'Matrícula', 'Cargo', 'Unidade', 'Pedido', 'Tipo', 'Início', 'Fim', 'Situação',
        'Chefia', 'Decisão chefia', 'Direção', 'Decisão Direção', 'Enviado em'],
      visiveis.map((s) => [s.protocolo, s.solicitante_nome, s.solicitante_matricula, s.solicitante_cargo, s.unidade_nome,
        CATEGORIAS[s.categoria].titulo, rotuloTipo(s), s.data_inicio, s.data_fim, s.situacao,
        s.chefia_nome, s.chefia_decisao, s.direcao_nome, s.direcao_decisao, dataCurta(s.criado_em)]));
  }

  return (
    <div className="w-full">
      <Cabecalho
        icone={arquivo ? Archive : Table2}
        titulo={arquivo ? 'Arquivo' : 'Todas as solicitações'}
        descricao={arquivo ? 'Solicitações finalizadas que foram arquivadas. Dá para restaurar ou excluir de vez.'
          : 'Pedidos de todas as unidades. Clique em uma linha para ver os detalhes, o comprovante e o histórico.'}>
        <Botao variante="secundario" onClick={exportar} disabled={!visiveis.length}>
          <Download className="size-4" aria-hidden /> Baixar planilha (CSV)
        </Botao>
      </Cabecalho>

      <div className="dock-card mt-6 grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-8">
        <Campo rotulo="Buscar" className="sm:col-span-2">
          <CampoBusca valor={busca} onChange={setBusca} placeholder="Nome, matrícula ou protocolo" />
        </Campo>
        <Campo rotulo="Situação">
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao | '')} className={inputCls}>
            <option value="">Todas</option>
            {SITUACOES.filter((x) => !arquivo || !x.startsWith('Aguardando')).map((x) => <option key={x}>{x}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Pedido">
          <select value={cat} onChange={(e) => setCat(e.target.value as Categoria | '')} className={inputCls}>
            <option value="">Todos</option>
            {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => <option key={c} value={c}>{CATEGORIAS[c].titulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Unidade" className="lg:col-span-2">
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className={inputCls}>
            <option value="">Todas</option>
            {unidades.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-2 lg:col-span-2">
          <Campo rotulo="De"><input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={inputCls} /></Campo>
          <Campo rotulo="Até"><input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} className={inputCls} /></Campo>
        </div>
        {filtrando && (
          <div className="sm:col-span-2 lg:col-span-8 flex items-center justify-between text-sm text-tinta-suave">
            <span>{visiveis.length} de {dados?.length ?? 0} solicitações</span>
            <button type="button" className="font-semibold text-electric-cobalt hover:underline"
              onClick={() => { setBusca(''); setSituacao(''); setCat(''); setUnidade(''); setDe(''); setAte(''); }}>
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {erro && <div className="mt-4"><Aviso>{erro}</Aviso></div>}
      {ok && <div className="mt-4"><Aviso tom="info">{ok}</Aviso></div>}

      <div className={`mt-4 space-y-3 md:hidden ${atualizando ? 'opacity-70' : ''}`}>
        {dados && visiveis.length === 0 && <div className="dock-card p-8 text-center text-sm text-slate-gray">Nada encontrado.</div>}
        {pag.visiveis.map((s) => (
          <CartaoSolicitacao key={s.id} s={s} mostrarSolicitante acoes={
            <>
              {s.solicitante_id !== usuarioId && (s.situacao === 'Aguardando chefia' || s.situacao === 'Aguardando direção') && <AcoesDecisao s={s} quem="direcao" onFeito={feito} />}
              <AcaoArquivar s={s} onFeito={feito} />
              <AcaoExcluir s={s} onFeito={feito} />
            </>
          } />
        ))}
      </div>
      <div className={`mt-4 hidden transition-opacity md:block ${atualizando ? 'opacity-70' : ''}`}>
        <TabelaWrap>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>Protocolo</th><th className={thCls}>Funcionário</th><th className={thCls}>Unidade</th>
                <th className={thCls}>Pedido</th><th className={thCls}>Período</th><th className={thCls}>Enviado</th>
                <th className={thCls}>Situação</th><th className={thCls}><span className="sr-only">Abrir</span></th>
              </tr>
            </thead>
            <tbody>
              {!dados && <tr><td colSpan={8} className={`${tdCls} text-tinta-suave`}>Carregando…</td></tr>}
              {dados && visiveis.length === 0 && (
                <tr><td colSpan={8} className={`${tdCls} py-6 text-center text-tinta-suave`}>
                  {dados.length === 0 ? (arquivo ? 'O arquivo está vazio.' : 'Nenhuma solicitação ainda.') : 'Nada encontrado com esses filtros.'}
                </td></tr>
              )}
              {pag.visiveis.map((s) => (
                <Linha key={s.id} s={s} aberta={aberta === s.id} usuarioId={usuarioId}
                  onAbrir={() => setAberta(aberta === s.id ? null : s.id)} onFeito={feito} />
              ))}
            </tbody>
          </table>
        </TabelaWrap>
      </div>
      <Paginacao p={pag} rotulo="solicitações" />
    </div>
  );
}

function Linha({ s, aberta, usuarioId, onAbrir, onFeito }: {
  s: Solicitacao; aberta: boolean; usuarioId: string; onAbrir: () => void; onFeito: (m: string) => void;
}) {
  const podeDecidir = s.solicitante_id !== usuarioId && (s.situacao === 'Aguardando chefia' || s.situacao === 'Aguardando direção');
  return (
    <Fragment>
      <tr onClick={onAbrir} className={`cursor-pointer ${aberta ? 'bg-acento-claro/40' : 'hover:bg-papel/50'}`}>
        <td className={`${tdCls} whitespace-nowrap font-mono text-xs`}>{s.protocolo}</td>
        <td className={tdCls}>
          <span className="font-medium">{s.solicitante_nome}</span>
          <span className="block text-xs text-tinta-suave">Matrícula: {s.solicitante_matricula ?? 'não informada'}</span>
        </td>
        <td className={tdCls}>{s.unidade_nome ?? <span className="text-tinta-suave">Sede</span>}</td>
        <td className={tdCls}>
          <span className="block text-xs text-tinta-suave">{CATEGORIAS[s.categoria].titulo}</span>{rotuloTipo(s)}
        </td>
        <td className={`${tdCls} whitespace-nowrap`}>{periodo(s)}</td>
        <td className={`${tdCls} whitespace-nowrap`}>{dataCurta(s.criado_em)}</td>
        <td className={tdCls}><Selo texto={s.situacao} /></td>
        <td className={`${tdCls} text-right`}>
          <button type="button" aria-expanded={aberta} aria-label={aberta ? 'Fechar detalhes' : 'Abrir detalhes'}
            className="rounded p-1 text-tinta-suave hover:bg-papel hover:text-tinta">
            <ChevronDown className={`size-4 transition-transform ${aberta ? 'rotate-180' : ''}`} />
          </button>
        </td>
      </tr>
      {aberta && (
        <tr>
          <td colSpan={8} className="border-b border-linha bg-papel/60 p-3">
            <CartaoSolicitacao s={s} mostrarSolicitante acoes={
              <>
                {podeDecidir && <AcoesDecisao s={s} quem="direcao" onFeito={onFeito} />}
                <AcaoArquivar s={s} onFeito={onFeito} />
                <AcaoExcluir s={s} onFeito={onFeito} />
              </>
            } />
          </td>
        </tr>
      )}
    </Fragment>
  );
}
