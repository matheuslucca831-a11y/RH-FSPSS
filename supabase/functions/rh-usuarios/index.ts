// =====================================================================
// SIGER RH | Edge Function: rh-usuarios
// Cria acessos, redefine senha, muda matrícula, desativa/reativa e libera
// novo celular (verificação em duas etapas). Só a Direção, com sessão
// verificada, pode usar. A chave secreta fica no Supabase e nunca passa pelo site.
//
// Variável opcional (Edge Functions > Secrets):
//   ALLOWED_ORIGINS = https://rh.seudominio.com.br  (endereços do site, separados por vírgula)
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGENS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MATRICULA = /^[A-Za-z0-9._]{1,40}$/;
const PAPEIS = ['funcionario', 'enfermeiro', 'gerente', 'supervisor', 'coordenacao', 'direcao'];
const GRUPOS = ['geral', 'farmacia', 'enfermeiro', 'gerente'];
// Sem unidade obrigatória (Supervisor pode ter lotação; Coordenação e Direção ficam na Sede)
const SEM_UNIDADE = ['supervisor', 'coordenacao', 'direcao'];
const COMUNS = ['12345678', '123456789', '1234567890', 'senha123', 'senha1234', 'password1', 'abc12345', 'fspss123', 'mudar123', 'qwerty123'];

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

function problemaSenha(senha: string, matricula?: string) {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (senha.length > 72) return 'A senha pode ter no máximo 72 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) return 'Use letras e números na senha.';
  if (COMUNS.includes(senha.toLowerCase())) return 'Esta senha é muito fácil de adivinhar.';
  if (matricula && senha.toLowerCase().includes(matricula.toLowerCase())) return 'A senha não pode conter a matrícula.';
  return null;
}

/** Lê as informações do token (já validado pelo getUser) */
function claims(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const resposta = (corpo: Record<string, unknown>) => new Response(JSON.stringify(corpo), { headers: h });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' });
  if (ORIGENS.length && !ORIGENS.includes(req.headers.get('Origin') ?? '')) return resposta({ erro: 'Origem não autorizada.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  let servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!servico) {
    try {
      const chaves = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
      servico = chaves.default ?? Object.values(chaves)[0] ?? '';
    } catch { /* sem chave */ }
  }
  if (!servico) return resposta({ erro: 'A função não encontrou a chave secreta do projeto.' });
  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Quem está chamando
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return resposta({ erro: 'Sessão não enviada. Saia e entre de novo.' });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return resposta({ erro: 'Sessão expirada. Saia e entre de novo.' });

  const { data: eu } = await admin.from('perfis').select('nome, papel, ativo, deve_trocar_senha').eq('id', user.id).maybeSingle();
  if (!eu?.ativo || eu.papel !== 'direcao' || eu.deve_trocar_senha) return resposta({ erro: 'Só a Direção pode fazer isso.' });
  const { data: cfg } = await admin.from('seguranca_config').select('exigir_mfa_direcao').maybeSingle();
  if ((cfg?.exigir_mfa_direcao ?? true) && claims(token).aal !== 'aal2') {
    return resposta({ erro: 'Confirme o código do app autenticador (saia e entre de novo) antes de fazer isso.' });
  }

  const corpo = await req.json().catch(() => null);
  if (!corpo?.acao || typeof corpo.acao !== 'string') return resposta({ erro: 'Pedido inválido.' });

  const auditar = (acao: string, alvoId: string, alvoNome: string, detalhe: Record<string, unknown> = {}) =>
    admin.from('auditoria').insert({ usuario_id: user.id, usuario_nome: eu.nome, acao, alvo_tipo: 'perfil', alvo_id: alvoId, alvo_nome: alvoNome, detalhe });
  const encerrarSessoes = (alvo: string) => admin.rpc('encerrar_sessoes', { p_usuario: alvo });
  const alvoValido = async (alvo: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(alvo)) return null;
    const { data } = await admin.from('perfis').select('id, nome, matricula, papel, ativo').eq('id', alvo).maybeSingle();
    return data;
  };

  // 2) Criar acesso
  if (corpo.acao === 'criar') {
    const nome = String(corpo.nome ?? '').trim().slice(0, 150);
    const matricula = String(corpo.matricula ?? '').trim();
    const email = String(corpo.email ?? '').trim().toLowerCase();
    const senha = String(corpo.senha ?? '');
    const cargo = String(corpo.cargo ?? '').trim().slice(0, 120) || null;
    const papel = PAPEIS.includes(corpo.papel) ? corpo.papel : null;
    const grupo = GRUPOS.includes(corpo.grupo_cargo) ? corpo.grupo_cargo : 'geral';
    const unidadeId = papel && !['coordenacao', 'direcao'].includes(papel) && corpo.unidade_id ? String(corpo.unidade_id) : null;

    if (nome.length < 2) return resposta({ erro: 'Informe o nome.' });
    if (!MATRICULA.test(matricula)) return resposta({ erro: 'Matrícula inválida (use só letras, números e ponto).' });
    if (!EMAIL.test(email) || email.split('@')[0] !== matricula.toLowerCase()) return resposta({ erro: 'Login inválido.' });
    const p = problemaSenha(senha, matricula);
    if (p) return resposta({ erro: p });
    if (!papel) return resposta({ erro: 'Escolha o tipo de acesso.' });
    if (!SEM_UNIDADE.includes(papel) && !unidadeId) return resposta({ erro: 'Escolha a unidade.' });
    if (unidadeId) {
      const { data: un } = await admin.from('unidades').select('id').eq('id', unidadeId).eq('ativa', true).maybeSingle();
      if (!un) return resposta({ erro: 'Escolha uma unidade ativa.' });
    }
    const { data: jaTem } = await admin.from('perfis').select('id').eq('matricula', matricula).maybeSingle();
    if (jaTem) return resposta({ erro: 'Já existe um acesso com esta matrícula.' });

    const { data: criado, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error || !criado.user) {
      const jaExiste = /already|registered|exists/i.test(error?.message ?? '');
      return resposta({ erro: jaExiste ? 'Já existe um login com esta matrícula.' : 'Não foi possível criar o login. Veja os Logs da função.' });
    }
    const { error: e2 } = await admin.from('perfis').insert({
      id: criado.user.id, nome, matricula, email, cargo, papel, grupo_cargo: grupo, unidade_id: unidadeId, ativo: true, deve_trocar_senha: true,
    });
    if (e2) {
      await admin.auth.admin.deleteUser(criado.user.id); // não deixa login sem perfil
      return resposta({ erro: 'Não foi possível criar o perfil. Veja os Logs da função.' });
    }
    await auditar('Acesso criado', criado.user.id, nome, { matricula, papel, grupo_cargo: grupo, unidade_id: unidadeId });
    return resposta({ ok: true, id: criado.user.id });
  }

  const alvo = await alvoValido(String(corpo.usuario_id ?? ''));
  if (!alvo) return resposta({ erro: 'Usuário não encontrado.' });

  // 3) Senha temporária (a pessoa troca no próximo acesso)
  if (corpo.acao === 'senha') {
    const senha = String(corpo.senha ?? '');
    const p = problemaSenha(senha, alvo.matricula);
    if (p) return resposta({ erro: p });
    const { error } = await admin.auth.admin.updateUserById(alvo.id, { password: senha });
    if (error) return resposta({ erro: 'Não foi possível trocar a senha. Veja os Logs da função.' });
    await admin.from('perfis').update({ deve_trocar_senha: true }).eq('id', alvo.id);
    await encerrarSessoes(alvo.id);
    await auditar('Senha redefinida pela Direção', alvo.id, alvo.nome);
    return resposta({ ok: true });
  }

  // 4) Mudar matrícula (muda também o login)
  if (corpo.acao === 'matricula') {
    const matricula = String(corpo.matricula ?? '').trim();
    const email = String(corpo.email ?? '').trim().toLowerCase();
    if (!MATRICULA.test(matricula) || !EMAIL.test(email) || email.split('@')[0] !== matricula.toLowerCase()) {
      return resposta({ erro: 'Matrícula inválida.' });
    }
    const { data: jaTem } = await admin.from('perfis').select('id').eq('matricula', matricula).neq('id', alvo.id).maybeSingle();
    if (jaTem) return resposta({ erro: 'Já existe um acesso com esta matrícula.' });
    const { error } = await admin.auth.admin.updateUserById(alvo.id, { email, email_confirm: true });
    if (error) return resposta({ erro: 'Não foi possível mudar o login. Veja os Logs da função.' });
    const { error: e2 } = await admin.from('perfis').update({ matricula, email }).eq('id', alvo.id);
    if (e2) return resposta({ erro: 'Não foi possível salvar a matrícula.' });
    await auditar('Matrícula alterada', alvo.id, alvo.nome, { matricula: { antes: alvo.matricula, depois: matricula } });
    return resposta({ ok: true });
  }

  // 5) Desativar / reativar (desativar bloqueia o login e derruba as sessões abertas)
  if (corpo.acao === 'ativo') {
    if (alvo.id === user.id) return resposta({ erro: 'Você não pode desativar o seu próprio acesso.' });
    const ativo = corpo.ativo === true;
    const { error: e1 } = await admin.from('perfis').update({ ativo }).eq('id', alvo.id);
    if (e1) return resposta({ erro: e1.message.includes('Direção') ? e1.message : 'Não foi possível alterar o acesso.' });
    const { error } = await admin.auth.admin.updateUserById(alvo.id, { ban_duration: ativo ? 'none' : '876000h' });
    if (error) return resposta({ erro: 'O perfil foi alterado, mas o bloqueio do login falhou. Veja os Logs da função.' });
    if (!ativo) await encerrarSessoes(alvo.id);
    await auditar(ativo ? 'Acesso reativado' : 'Acesso desativado', alvo.id, alvo.nome);
    return resposta({ ok: true });
  }

  // 6) Liberar novo celular (apaga o app autenticador cadastrado)
  if (corpo.acao === 'mfa_reset') {
    if (alvo.id === user.id) return resposta({ erro: 'Peça a outra pessoa da Direção para liberar o seu novo celular.' });
    const { data: fatores, error } = await admin.auth.admin.mfa.listFactors({ userId: alvo.id });
    if (error) return resposta({ erro: 'Não foi possível consultar a verificação em duas etapas.' });
    for (const f of fatores?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: alvo.id, id: f.id });
    await encerrarSessoes(alvo.id);
    await auditar('Verificação em duas etapas reiniciada', alvo.id, alvo.nome, { apps_removidos: fatores?.factors?.length ?? 0 });
    return resposta({ ok: true });
  }

  return resposta({ erro: 'Ação desconhecida.' });
});
