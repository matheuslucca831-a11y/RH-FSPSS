import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/** Explica, em português, por que a chamada a uma Edge Function falhou */
async function explicar(nome: string, error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const status = (error.context as Response).status;
    if (status === 404) return `A função ${nome} não foi encontrada. Publique no Supabase (Edge Functions) com esse nome exato.`;
    if (status === 401) return `O Supabase recusou a chamada. Em Edge Functions, ${nome}, Details, desligue "Verify JWT" e salve.`;
    return `A função ${nome} respondeu com erro ${status}. Veja os Logs da função no Supabase.`;
  }
  if (error instanceof FunctionsRelayError) return 'O Supabase não conseguiu repassar a chamada. Tente de novo em instantes.';
  if (error instanceof FunctionsFetchError) {
    return `Não foi possível falar com a função ${nome}. Confira se ela foi publicada e se o endereço do site está em ALLOWED_ORIGINS.`;
  }
  return `Erro inesperado ao chamar a função ${nome}.`;
}

/** Chama uma Edge Function do SIGER RH. Ela sempre responde { ok, ... } ou { erro } */
export async function chamarFuncao<T = Record<string, unknown>>(nome: string, corpo: Record<string, unknown>): Promise<T & { erro?: string }> {
  const { data, error } = await createClient().functions.invoke(nome, { body: corpo });
  if (error) return { erro: await explicar(nome, error) } as T & { erro?: string };
  return (data ?? {}) as T & { erro?: string };
}

/** Abre o comprovante: a função confere a permissão, registra quem abriu e devolve um link de 60 segundos */
export async function abrirComprovante(solicitacaoId: string): Promise<string | null> {
  // abre a aba já no clique (evita bloqueio de pop-up) e depois aponta para o arquivo
  const aba = window.open('', '_blank');
  if (aba) aba.opener = null;
  const r = await chamarFuncao<{ url?: string }>('rh-comprovante', { solicitacao_id: solicitacaoId });
  if (r.erro || !r.url) {
    aba?.close();
    return r.erro ?? 'Não foi possível abrir o comprovante.';
  }
  if (aba) aba.location.href = r.url;
  else window.location.href = r.url;
  return null;
}
