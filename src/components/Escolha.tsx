'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export type Opcao = { valor: string; rotulo: string; detalhe?: string };

/** Opções mostradas de cada vez (listas grandes, como pessoas) */
const LIMITE = 80;

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Campo de escolha com busca: a pessoa digita e as opções que combinam aparecem logo abaixo.
 * Substitui as listas suspensas (select) do sistema.
 *  - vazio: texto da opção "nenhuma" (ex.: "Todas"); se não vier, o campo exige uma escolha
 *  - livre: aceita também o que foi digitado (ex.: um cargo que não está na lista)
 */
export default function Escolha({
  valor, onChange, opcoes, placeholder = 'Digite para buscar', vazio, rotulo, id, className = '', desabilitado = false, compacto = false, livre = false,
}: {
  valor: string;
  onChange: (valor: string) => void;
  opcoes: Opcao[];
  placeholder?: string;
  vazio?: string;
  rotulo?: string;
  id?: string;
  className?: string;
  desabilitado?: boolean;
  compacto?: boolean;
  livre?: boolean;
}) {
  const auto = useId();
  const idCampo = id ?? auto;
  const idLista = `${idCampo}-lista`;
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [ativo, setAtivo] = useState(0);
  const [paraCima, setParaCima] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  const escolhida = opcoes.find((o) => o.valor === valor) ?? (livre && valor ? { valor, rotulo: valor } : undefined);
  const todas = useMemo(() => (vazio !== undefined ? [{ valor: '', rotulo: vazio }, ...opcoes] : opcoes), [opcoes, vazio]);
  const filtradas = useMemo(() => {
    const t = normalizar(texto.trim());
    if (!t) return todas;
    const achadas = todas.filter((o) => normalizar(`${o.rotulo} ${o.detalhe ?? ''}`).includes(t));
    if (livre && !todas.some((o) => normalizar(o.rotulo) === t)) {
      return [{ valor: texto.trim(), rotulo: texto.trim(), detalhe: 'Usar o que foi digitado' }, ...achadas];
    }
    return achadas;
  }, [todas, texto, livre]);

  // Abre para cima quando não há espaço embaixo (ex.: barra fixa no rodapé)
  useEffect(() => {
    if (!aberto || !caixa.current) return;
    const r = caixa.current.getBoundingClientRect();
    setParaCima(window.innerHeight - r.bottom < 280 && r.top > window.innerHeight - r.bottom);
  }, [aberto]);

  // Fecha ao tocar fora
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) { setAberto(false); setTexto(''); } };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);

  // Mantém a opção destacada visível
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [ativo]);

  function escolher(o: Opcao) {
    onChange(o.valor);
    setAberto(false);
    setTexto('');
  }

  function tecla(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setAtivo((a) => Math.min(a + 1, Math.min(filtradas.length, LIMITE) - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (aberto && filtradas[ativo]) { e.preventDefault(); escolher(filtradas[ativo]); } }
    else if (e.key === 'Escape') { setAberto(false); setTexto(''); }
    else if (e.key === 'Tab') { if (livre && texto.trim()) onChange(texto.trim()); setAberto(false); setTexto(''); }
  }

  const mostrado = aberto ? texto : escolhida?.rotulo ?? (valor === '' && vazio !== undefined ? vazio : '');

  return (
    // preventDefault no clique: dentro de um <label>, o clique numa opção não reabre a lista
    <div ref={caixa} className={`relative ${className}`} onClick={(e) => { if (e.target !== e.currentTarget) e.preventDefault(); }}>
      <div className="relative">
        <input
          id={idCampo}
          type="text"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-label={rotulo}
          aria-activedescendant={aberto && filtradas[ativo] ? `${idLista}-${ativo}` : undefined}
          autoComplete="off"
          disabled={desabilitado}
          value={mostrado}
          placeholder={aberto ? escolhida?.rotulo ?? placeholder : placeholder}
          onFocus={() => { setAberto(true); setAtivo(0); }}
          onClick={() => setAberto(true)}
          onChange={(e) => { setTexto(e.target.value); setAberto(true); setAtivo(0); }}
          onKeyDown={tecla}
          className={`w-full rounded-xl border border-linha bg-white pl-4 pr-16 text-sm text-ink-charcoal outline-none transition-colors placeholder:text-slate-gray/70 focus:border-electric-cobalt focus:ring-2 focus:ring-electric-cobalt/20 disabled:bg-faint-gray disabled:text-slate-gray ${
            compacto ? 'min-h-[40px] py-2' : 'min-h-[44px] py-2.5'}`}
        />
        <span className="absolute inset-y-0 right-2 flex items-center gap-0.5">
          {vazio !== undefined && valor !== '' && !desabilitado && (
            <button type="button" aria-label="Limpar" onClick={(e) => { e.preventDefault(); onChange(''); }}
              className="flex size-7 items-center justify-center rounded-full text-slate-gray hover:bg-faint-gray">
              <X className="size-3.5" aria-hidden />
            </button>
          )}
          <ChevronDown className={`pointer-events-none size-4 text-slate-gray transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </div>
      {aberto && !desabilitado && (
        <ul ref={lista} id={idLista} role="listbox"
          className={`absolute left-0 right-0 z-50 max-h-64 ${paraCima ? 'bottom-full mb-1' : 'mt-1'} overflow-y-auto rounded-xl border border-linha bg-white p-1 shadow-xl`}>
          {filtradas.length === 0 && <li className="px-3 py-2.5 text-sm text-slate-gray">Nada encontrado</li>}
          {filtradas.slice(0, LIMITE).map((o, i) => (
            <li key={`${o.valor}-${i}`} id={`${idLista}-${i}`} data-i={i} role="option" aria-selected={o.valor === valor}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => escolher(o)}
              onMouseEnter={() => setAtivo(i)}
              className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                i === ativo ? 'bg-lavender-mist text-electric-cobalt' : 'text-ink-charcoal'}`}>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${o.valor === '' ? 'text-slate-gray' : ''}`}>{o.rotulo}</span>
                {o.detalhe && <span className="block truncate text-xs text-slate-gray">{o.detalhe}</span>}
              </span>
              {o.valor === valor && <Check className="size-4 shrink-0 text-electric-cobalt" aria-hidden />}
            </li>
          ))}
          {filtradas.length > LIMITE && (
            <li className="px-3 py-2 text-xs text-slate-gray">Mais {filtradas.length - LIMITE} opções: digite para filtrar</li>
          )}
        </ul>
      )}
    </div>
  );
}
