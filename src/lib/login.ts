/**
 * O login é pela matrícula. Por trás, o Supabase usa e-mail: matrícula@domínio.
 * O sistema antigo usava "rh12.com"; mantenha o mesmo para os logins já criados continuarem valendo.
 */
export const DOMINIO_LOGIN = (process.env.NEXT_PUBLIC_DOMINIO_LOGIN || 'rh12.com').replace(/^@/, '');

/** Matrícula → e-mail de login (se já vier um e-mail, usa como está) */
export function emailDaMatricula(matricula: string) {
  const m = matricula.trim().toLowerCase();
  return m.includes('@') ? m : `${m}@${DOMINIO_LOGIN}`;
}

/** Só letras, números, ponto, hífen e sublinhado */
export const matriculaValida = (m: string) => /^[a-zA-Z0-9._-]{1,40}$/.test(m.trim());
