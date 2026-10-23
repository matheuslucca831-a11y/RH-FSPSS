import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, type LucideIcon } from 'lucide-react';
import { nomeCompetencia, deslocarCompetencia } from '@/lib/formato';

/** Estilo base dos campos, sem largura definida */
export const campoCls =
  'rounded-xl border border-linha bg-white px-3.5 py-2.5 text-sm text-ink-charcoal outline-none ' +
  'transition-all duration-150 focus:border-electric-cobalt focus:ring-2 focus:ring-electric-cobalt/20 disabled:bg-faint-gray disabled:text-steel-gray';
export const inputCls = `w-full ${campoCls}`;

type Variante = 'primario' | 'secundario' | 'perigo' | 'discreto';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-electric-cobalt text-white hover:bg-deep-cobalt shadow-xs',
  secundario: 'border border-linha bg-white text-ink-charcoal hover:bg-faint-gray',
  perigo: 'bg-erro text-white hover:opacity-90 shadow-xs',
  discreto: 'text-slate-gray hover:bg-faint-gray hover:text-ink-charcoal',
};

export function Botao({
  variante = 'primario',
  carregando = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || carregando}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium
                  transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
    >
      {carregando && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Campo({ rotulo, children, className = '', dica }: { rotulo: string; children: ReactNode; className?: string; dica?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-gray">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-slate-gray">{dica}</span>}
    </label>
  );
}

type Tom = 'sucesso' | 'atencao' | 'perigo' | 'info' | 'neutro' | 'cheio';
const TONS: Record<Tom, { caixa: string; ponto: string }> = {
  sucesso: { caixa: 'bg-forest-light text-forest border-forest/20', ponto: 'bg-forest' },
  atencao: { caixa: 'bg-warning-light text-warning border-warning/20', ponto: 'bg-warning' },
  perigo: { caixa: 'bg-danger-light text-danger border-danger/20', ponto: 'bg-danger' },
  info: { caixa: 'bg-lavender-mist text-electric-cobalt border-electric-cobalt/20', ponto: 'bg-electric-cobalt' },
  neutro: { caixa: 'bg-faint-gray text-slate-gray border-linha', ponto: 'bg-steel-gray' },
  cheio: { caixa: 'bg-electric-cobalt text-white border-electric-cobalt', ponto: 'bg-white' },
};
const SELOS: Record<string, Tom> = {
  'Aguardando chefia': 'atencao',
  'Aguardando direção': 'info',
  Aprovado: 'sucesso',
  Negado: 'perigo',
  Cancelado: 'neutro',
  Arquivada: 'neutro',
  Ativo: 'sucesso',
  Ativa: 'sucesso',
  Inativo: 'neutro',
  Inativa: 'neutro',
  'Troca de senha pendente': 'atencao',
  Funcionário: 'info',
  'Chefia da unidade': 'atencao',
  Direção: 'cheio',
};

/** Pílula de situação com ponto colorido (padrão SIGER) */
export function Selo({ texto, tom }: { texto: string; tom?: Tom }) {
  const t = TONS[tom ?? SELOS[texto] ?? 'neutro'];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${t.caixa}`}>
      <span className={`size-1.5 rounded-full ${t.ponto}`} aria-hidden />
      {texto}
    </span>
  );
}

export function Aviso({ tom = 'erro', children }: { tom?: 'erro' | 'info' | 'atencao'; children: ReactNode }) {
  const cls = tom === 'erro' ? 'bg-danger-light text-danger border-danger/20'
    : tom === 'atencao' ? 'bg-warning-light text-warning border-warning/20'
    : 'bg-lavender-mist text-electric-cobalt border-electric-cobalt/20';
  const Icone = tom === 'erro' ? AlertTriangle : tom === 'atencao' ? AlertTriangle : CheckCircle2;
  return (
    <p role={tom === 'erro' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium ${cls}`}>
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function SeletorMes({ valor, onChange }: { valor: string; onChange: (c: string) => void }) {
  return (
    <div className="inline-flex min-h-[44px] items-center rounded-full border border-linha bg-white shadow-xs">
      <button type="button" aria-label="Mês anterior" onClick={() => onChange(deslocarCompetencia(valor, -1))}
        className="flex size-11 items-center justify-center rounded-l-full text-slate-gray transition-colors hover:text-ink-charcoal">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-36 px-2 text-center text-sm font-semibold text-ink-charcoal" aria-live="polite">{nomeCompetencia(valor)}</span>
      <button type="button" aria-label="Próximo mês" onClick={() => onChange(deslocarCompetencia(valor, 1))}
        className="flex size-11 items-center justify-center rounded-r-full text-slate-gray transition-colors hover:text-ink-charcoal">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/** Tabela com rolagem horizontal própria */
export function TabelaWrap({ children }: { children: ReactNode }) {
  return <div className="dock-card overflow-x-auto">{children}</div>;
}
export const thCls = 'whitespace-nowrap border-b border-linha bg-faint-gray/70 px-4 py-3 text-left text-xs font-semibold text-slate-gray';
export const tdCls = 'border-b border-linha/70 px-4 py-3.5 align-middle text-sm text-ink-charcoal';

/** Banner de cabeçalho da tela (cartão com ícone, título e ações) */
export function Cabecalho({ titulo, descricao, icone: Icone, children }: {
  titulo: string; descricao?: ReactNode; icone?: LucideIcon; children?: ReactNode;
}) {
  return (
    <div className="dock-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-center gap-4">
        {Icone && (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-electric-cobalt text-white shadow-xs">
            <Icone className="size-6" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-ink-charcoal sm:text-2xl">{titulo}</h1>
          {descricao && <p className="mt-0.5 text-sm text-slate-gray">{descricao}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="dock-card p-10 text-center text-sm text-slate-gray">{children}</div>;
}

/** Abas em pílulas (padrão SIGER) */
export function Abas<T extends string>({ abas, valor, onChange, rotulo, contagem }: {
  abas: readonly (readonly [T, ReactNode] | readonly [T, ReactNode, LucideIcon])[]; valor: T; onChange: (v: T) => void; rotulo: string;
  contagem?: Partial<Record<T, number>>;
}) {
  return (
    <div role="tablist" aria-label={rotulo} className="flex flex-wrap gap-2">
      {abas.map(([v, r, Icone]) => {
        const ativo = valor === v;
        const n = contagem?.[v] ?? 0;
        return (
          <button key={v} role="tab" type="button" aria-selected={ativo} onClick={() => onChange(v)}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold transition-all ${
              ativo ? 'bg-electric-cobalt text-white shadow-xs' : 'border border-linha bg-white text-mid-graphite hover:bg-faint-gray hover:text-ink-charcoal'}`}>
            {Icone && <Icone className="size-4" aria-hidden />}
            {r}
            {n > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${ativo ? 'bg-white/25 text-white' : 'bg-lavender-mist text-electric-cobalt'}`}>{n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Mesmo visual das abas, para filtros de situação */
export function Segmentos<T extends string>({ opcoes, valor, onChange, rotulo, contagem }: {
  opcoes: readonly (readonly [T, string])[]; valor: T; onChange: (v: T) => void; rotulo: string;
  contagem?: Partial<Record<T, number>>; alerta?: T[];
}) {
  return <Abas abas={opcoes} valor={valor} onChange={onChange} rotulo={rotulo} contagem={contagem} />;
}

/** Busca em pílula */
export function CampoBusca({ valor, onChange, placeholder, className = '' }: {
  valor: string; onChange: (v: string) => void; placeholder: string; className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <svg className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-gray" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Buscar" maxLength={80}
        className="min-h-[44px] w-full rounded-full border border-linha bg-white py-2.5 pl-10 pr-4 text-sm text-ink-charcoal shadow-xs outline-none placeholder:text-slate-gray/80 focus:border-electric-cobalt focus:ring-2 focus:ring-electric-cobalt/20" />
    </div>
  );
}
