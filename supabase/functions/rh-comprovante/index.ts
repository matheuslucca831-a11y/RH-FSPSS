// =====================================================================
// SIGER RH | Edge Function: rh-comprovante
// Único caminho para abrir um comprovante (atestados são dados de saúde).
// 1. Confere, com as regras do próprio banco (RLS), se quem pediu pode ver a solicitação
// 2. Gera um link que vale 60 segundos
// 3. Registra na auditoria quem abriu, quando e de qual pedido
//
// Variável opcional (Edge Functions > Secrets):
//   ALLOWED_ORIGINS = https://rh.seudominio.com.br
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGENS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function cabecalhos(req: Request) {
  const origem = req.headers.get('Origin') ?? '';
  const permitida = ORIGENS.length === 0 ? '*' : ORIGENS.includes(origem) ? origem : 'null';
  return {
    'Access-Control-Allow-Origin': permitida,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}

function chave(nomeAntigo: string, nomeNovo: string) {
  const v = Deno.env.get(nomeAntigo);
  if (v) return v;
  try {
    const chaves = JSON.parse(Deno.env.get(nomeNovo) ?? '{}');
    return chaves.default ?? Object.values(chaves)[0] ?? '';
  } catch {
    return '';
  }
}

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const resposta = (corpo: Record<string, unknown>) => new Response(JSON.stringify(corpo), { headers: h });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' });
  if (ORIGENS.length && !ORIGENS.includes(req.headers.get('Origin') ?? '')) return resposta({ erro: 'Origem não autorizada.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const servico = chave('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
  const publica = chave('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');
  if (!servico || !publica) return resposta({ erro: 'A função não encontrou as chaves do projeto.' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return resposta({ erro: 'Sessão não enviada. Saia e entre de novo.' });
  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return resposta({ erro: 'Sessão expirada. Saia e entre de novo.' });

  const corpo = await req.json().catch(() => null);
  const id = String(corpo?.solicitacao_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return resposta({ erro: 'Pedido inválido.' });

  // Consulta como a própria pessoa: o banco decide se ela pode ver (unidade, papel, duas etapas, senha trocada)
  const comoUsuario = createClient(url, publica, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: s } = await comoUsuario.from('solicitacoes')
    .select('id, protocolo, anexo_bucket, anexo_path, solicitante_id, solicitante_nome').eq('id', id).maybeSingle();
  if (!s?.anexo_path) return resposta({ erro: 'Comprovante não encontrado ou sem permissão para abrir.' });

  const { data: link, error } = await admin.storage.from(s.anexo_bucket).createSignedUrl(s.anexo_path, 60);
  if (error || !link?.signedUrl) return resposta({ erro: 'O arquivo não foi encontrado no armazenamento.' });

  const { data: eu } = await admin.from('perfis').select('nome').eq('id', user.id).maybeSingle();
  await admin.from('auditoria').insert({
    usuario_id: user.id, usuario_nome: eu?.nome ?? user.email, acao: 'Abriu comprovante',
    alvo_tipo: 'solicitacao', alvo_id: s.id, alvo_nome: s.protocolo,
    detalhe: { solicitante: s.solicitante_nome, proprio: s.solicitante_id === user.id },
  });

  return resposta({ ok: true, url: link.signedUrl });
});
