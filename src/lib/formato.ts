export const soDigitos = (s: string) => s.replace(/\D/g, '');

export function formatarCPF(cpf?: string | null) {
  const d = soDigitos(cpf ?? '');
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf ?? '';
}

/** Máscara enquanto digita: 000.000.000-00 */
export function mascaraCPF(valor: string) {
  const d = soDigitos(valor).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

/** Cartão SUS: 000 0000 0000 0000 */
export function mascaraCNS(valor: string) {
  const d = soDigitos(valor).slice(0, 15);
  return [d.slice(0, 3), d.slice(3, 7), d.slice(7, 11), d.slice(11, 15)].filter(Boolean).join(' ');
}
export const formatarCNS = (cns?: string | null) => (cns ? mascaraCNS(cns) : '');

/** Data de hoje 'AAAA-MM-DD' (horário local) */
export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'AAAA-MM-DD' + n dias (sem erro de fuso) */
export function somarDias(iso: string, n: number) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' */
export function dataBR(iso?: string | null) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Competência no formato do banco: 'AAAA-MM-01' */
export const competenciaAtual = () => hojeISO().slice(0, 8) + '01';

export function deslocarCompetencia(c: string, meses: number) {
  const [a, m] = c.split('-').map(Number);
  const d = new Date(a, m - 1 + meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Último dia do mês da competência */
export const fimDoMes = (c: string) => somarDias(deslocarCompetencia(c, 1), -1);

/** 'Outubro de 2026' */
export function nomeCompetencia(c: string) {
  const [a, m] = c.split('-').map(Number);
  const s = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dataHoraBR(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Normaliza para busca sem acento e sem maiúsculas */
export const normalizar = (s?: string | null) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Converte erros do Supabase em mensagens para o usuário */
export function mensagemErro(e: { message?: string; code?: string } | null | undefined) {
  if (!e) return 'Algo deu errado. Tente de novo.';
  if (e.message?.includes('row-level security')) return 'Você não tem permissão para esta alteração.';
  if (e.code === '23505') return 'Este registro já existe.';
  return e.message ?? 'Algo deu errado. Tente de novo.';
}
