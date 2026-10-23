/** Aceita o endereço como vier da hospedagem (com ou sem https://, aspas, espaços ou barra no fim).
 *  Devolve null se não for um endereço válido. */
export function normalizarUrl(valor: string | undefined | null): string | null {
  let v = (valor ?? '').trim().replace(/^["']|["']$/g, '').trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}
