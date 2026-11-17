'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { normalizar } from '@/lib/formato';
import { CATEGORIAS, type Categoria, type Solicitacao } from '@/lib/solicitacoes';
import { CampoBusca, campoCls, Vazio } from '@/components/ui';
import { Paginacao, usePaginacao } from '@/components/Paginacao';
import CartaoSolicitacao from './CartaoSolicitacao';

type Props = {
  itens: Solicitacao[] | undefined;
  mostrarSolicitante?: boolean;
  acoes?: (s: Solicitacao) => ReactNode;
  destaque?: (s: Solicitacao) => boolean;
  vazio: ReactNode;
  /** Filtro por unidade (Direção) */
  comUnidade?: boolean;
  porPagina?: number;
  /** Assinar vários: quais podem ser marcados e quais estão marcados */
  selecao?: { pode: (s: Solicitacao) => boolean; marcados: Set<string>; alternar: (id: string) => void };
};

/** Busca + filtro de tipo + cartões paginados */
export default function ListaSolicitacoes({ itens, mostrarSolicitante, acoes, destaque, vazio, comUnidade, porPagina = 25, selecao }: Props) {
  const q = useSearchParams().get('q');
  const [busca, setBusca] = useState(q ?? '');
  const [cat, setCat] = useState<Categoria | ''>('');
  const [unidade, setUnidade] = useState('');

  const unidades = useMemo(
    () => [...new Set((itens ?? []).map((s) => s.unidade_nome).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [itens],
  );

  const visiveis = useMemo(() => {
    const t = normalizar(busca);
    return (itens ?? []).filter((s) =>
      (!cat || s.categoria === cat)
      && (!unidade || s.unidade_nome === unidade)
      && (!t || normalizar(`${s.solicitante_nome} ${s.solicitante_matricula} ${s.protocolo} ${s.tipo} ${s.subtipo ?? ''}`).includes(t)));
  }, [itens, busca, cat, unidade]);
  const pag = usePaginacao(visiveis, porPagina);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <CampoBusca valor={busca} onChange={setBusca} className="w-full min-w-56 flex-1 sm:w-auto"
          placeholder={mostrarSolicitante ? 'Buscar nome, matrícula ou protocolo' : 'Buscar protocolo ou tipo'} />
        <select value={cat} onChange={(e) => setCat(e.target.value as Categoria | '')} aria-label="Tipo de pedido" className={`${campoCls} flex-1 sm:flex-none`}>
          <option value="">Todos os tipos</option>
          {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => <option key={c} value={c}>{CATEGORIAS[c].titulo}</option>)}
        </select>
        {comUnidade && unidades.length > 1 && (
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)} aria-label="Unidade" className={`${campoCls} flex-1 sm:max-w-64 sm:flex-none`}>
            <option value="">Todas as unidades</option>
            {unidades.map((u) => <option key={u}>{u}</option>)}
          </select>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {!itens && <p className="text-sm text-tinta-suave" role="status">Carregando…</p>}
        {itens && visiveis.length === 0 && <Vazio>{itens.length === 0 ? vazio : 'Nada encontrado com esses filtros.'}</Vazio>}
        {pag.visiveis.map((s) => (
          <CartaoSolicitacao key={s.id} s={s} mostrarSolicitante={mostrarSolicitante} acoes={acoes?.(s)} destaque={destaque?.(s)}
            selecao={selecao?.pode(s) ? { marcado: selecao.marcados.has(s.id), alternar: () => selecao.alternar(s.id) } : undefined} />
        ))}
        <Paginacao p={pag} rotulo="solicitações" />
      </div>
    </>
  );
}
