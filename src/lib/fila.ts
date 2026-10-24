import type { SupabaseClient } from '@supabase/supabase-js';
import type { ItemFila } from './solicitacoes';

/** Pedidos aguardando a assinatura de quem está usando (o banco decide, função fila_assinaturas) */
export async function buscarFila(supabase: SupabaseClient): Promise<ItemFila[]> {
  const { data, error } = await supabase.rpc('fila_assinaturas');
  if (error) throw new Error(error.message ?? 'Erro ao carregar os pedidos para assinar.');
  return (data ?? []) as ItemFila[];
}

/** Quantos estão esperando você (sem contar os que só dá para assinar declarando ausência) */
export async function contarFila(supabase: SupabaseClient): Promise<number> {
  try {
    return (await buscarFila(supabase)).filter((i) => !i.precisa_motivo).length;
  } catch {
    return 0;
  }
}
