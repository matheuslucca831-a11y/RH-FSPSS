import type { SupabaseClient } from '@supabase/supabase-js';
import { buscarTudo } from './buscarTudo';
import { CAMPOS_SOLICITACAO, type Solicitacao } from './solicitacoes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Consulta = any;
type Filtro = (q: Consulta) => Consulta;

/**
 * Busca solicitações (em lotes, sem limite de 1000) com os filtros dados.
 * Ordena pelas mais recentes; lança erro para o useConsulta mostrar.
 */
export async function buscarSolicitacoes(supabase: SupabaseClient, filtro: Filtro, crescente = false): Promise<Solicitacao[]> {
  const res = await buscarTudo((de, ate) =>
    filtro(supabase.from('solicitacoes').select(CAMPOS_SOLICITACAO))
      .order('criado_em', { ascending: crescente }).order('id').range(de, ate));
  if (res.error) throw new Error(res.error.message ?? 'Erro ao carregar as solicitações.');
  return (res.data ?? []) as unknown as Solicitacao[];
}
