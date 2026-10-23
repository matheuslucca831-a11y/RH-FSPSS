'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const TAMANHOS = [25, 50, 100];

/** Divide uma lista em páginas. Volta para a página 1 quando a lista muda (filtro, busca, ordenação). */
export function usePaginacao<T>(itens: T[], inicial = 50) {
  const [porPagina, setPorPagina] = useState(inicial);
  const [pagina, setPagina] = useState(1);
  const [anterior, setAnterior] = useState(itens);
  if (itens !== anterior) {
    setAnterior(itens);
    setPagina(1);
  }
  const paginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const atual = Math.min(pagina, paginas);
  const inicio = (atual - 1) * porPagina;
  return {
    visiveis: itens.slice(inicio, inicio + porPagina),
    pagina: atual, paginas, total: itens.length, inicio, porPagina,
    irPara: (p: number) => setPagina(Math.min(Math.max(1, p), paginas)),
    mudarTamanho: (n: number) => { setPorPagina(n); setPagina(1); },
  };
}

type Pag = ReturnType<typeof usePaginacao>;

/** Barra "Mostrando 51–100 de 340" com anterior/próxima e itens por página */
export function Paginacao({ p, rotulo = 'registros' }: { p: Pag; rotulo?: string }) {
  if (p.total <= TAMANHOS[0]) return null;
  const btn = 'inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full border border-linha bg-white p-1.5 shadow-xs text-tinta-suave hover:text-tinta disabled:opacity-40';
  return (
    <nav aria-label="Paginação" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
      <span className="text-tinta-suave">
        Mostrando {p.inicio + 1}–{Math.min(p.inicio + p.porPagina, p.total)} de {p.total} {rotulo}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-tinta-suave">
          Por página
          <select value={p.porPagina} onChange={(e) => p.mudarTamanho(Number(e.target.value))}
            className="rounded-full border border-linha bg-white px-3 py-1.5 text-sm text-tinta">
            {TAMANHOS.map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" className={btn} disabled={p.pagina <= 1} onClick={() => p.irPara(p.pagina - 1)} aria-label="Página anterior">
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-20 text-center font-semibold">{p.pagina} de {p.paginas}</span>
        <button type="button" className={btn} disabled={p.pagina >= p.paginas} onClick={() => p.irPara(p.pagina + 1)} aria-label="Próxima página">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}
