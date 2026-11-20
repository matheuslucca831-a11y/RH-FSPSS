'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Janela por cima da tela (modal). Fecha no X, no Esc ou tocando fora.
 * No celular ocupa a tela toda; no computador fica centralizada.
 */
export default function Janela({ titulo, subtitulo, aberta, onFechar, children, rodape }: {
  titulo: string; subtitulo?: string; aberta: boolean; onFechar: () => void; children: React.ReactNode; rodape?: React.ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar.current(); };
    document.addEventListener('keydown', esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    caixa.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = antes; };
  }, [aberta]);

  if (!aberta || typeof document === 'undefined') return null;
  // no body: nada acima (animações, cartões) muda a posição da janela
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-ink-charcoal/40 backdrop-blur-[2px] sm:items-center sm:p-6"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div ref={caixa} role="dialog" aria-modal="true" aria-label={titulo}
        className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-linha px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink-charcoal">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-xs text-slate-gray">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-slate-gray hover:bg-faint-gray">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="flex items-center justify-end gap-2 border-t border-linha px-5 py-3">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}
