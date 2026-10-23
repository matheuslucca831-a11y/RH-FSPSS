/**
 * O Supabase devolve no máximo 1000 linhas por consulta.
 * Esta função busca em lotes até trazer tudo (com um teto de segurança).
 *
 * Uso: buscarTudo((de, ate) => supabase.from('x').select('...').order('id').range(de, ate))
 * Importante: a consulta precisa de .order() para os lotes não se repetirem.
 */
type Resposta<T> = { data: T[] | null; error: { message?: string; code?: string } | null };

export async function buscarTudo<T>(
  montar: (de: number, ate: number) => PromiseLike<Resposta<T>>,
  { lote = 1000, maximo = 20000 } = {},
): Promise<Resposta<T> & { cortado: boolean }> {
  const todos: T[] = [];
  for (let de = 0; de < maximo; de += lote) {
    const { data, error } = await montar(de, de + lote - 1);
    if (error) return { data: todos, error, cortado: false };
    todos.push(...(data ?? []));
    if (!data || data.length < lote) return { data: todos, error: null, cortado: false };
  }
  return { data: todos, error: null, cortado: true };
}
