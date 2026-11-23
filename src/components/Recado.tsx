'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

const EVENTO = 'siger:recado';

/** Mostra um aviso de confirmação no rodapé da tela (perto de onde a pessoa tocou) */
export const mostrarRecado = (texto: string) => window.dispatchEvent(new CustomEvent<string>(EVENTO, { detail: texto }));

/** Aviso fixo no rodapé, acima do menu do celular. Some sozinho depois de alguns segundos. */
export default function Recado() {
  const [texto, setTexto] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const f = (e: Event) => {
      setTexto((e as CustomEvent<string>).detail);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setTexto(null), 6000);
      navigator.vibrate?.(40);
    };
    window.addEventListener(EVENTO, f);
    return () => {
      window.removeEventListener(EVENTO, f);
      clearTimeout(timer.current);
    };
  }, []);

  return (
    <div aria-live="polite" role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-3 lg:bottom-6 lg:left-72">
      {texto && (
        <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-forest/25 bg-forest px-4 py-3 text-sm font-semibold text-white shadow-xl">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{texto}</span>
          <button type="button" onClick={() => setTexto(null)} aria-label="Fechar aviso"
            className="-m-1.5 flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-white/15">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
