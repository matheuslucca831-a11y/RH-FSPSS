import type { SupabaseClient } from '@supabase/supabase-js';
import type { Perfil } from './types';

/**
 * Em que etapa do acesso a pessoa está. A regra de verdade fica no banco
 * (usuario_ativo / mfa_ok); aqui o site só descobre o que precisa pedir.
 *
 * Ordem: senha > verificação em duas etapas (se exigida) > troca da senha inicial > liberado
 * (a troca vem depois porque, com duas etapas ativa, o Supabase exige a sessão verificada para trocar a senha)
 */
export type Etapa = 'entrar' | 'cadastrar_mfa' | 'confirmar_mfa' | 'trocar_senha' | 'liberado' | 'bloqueado';

export type Seguranca = {
  ativo: boolean;
  papel: 'funcionario' | 'chefia' | 'direcao';
  deve_trocar_senha: boolean;
  mfa_exigido: boolean;
  mfa_ok: boolean;
  minutos_inatividade: number;
  perfil?: Perfil;
};

/** Uma única consulta ao banco decide a etapa (e já traz o perfil) */
export async function descobrirEtapa(supabase: SupabaseClient): Promise<{ etapa: Etapa; seg: Seguranca | null; motivo?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { etapa: 'entrar', seg: null };

  const { data, error } = await supabase.rpc('minha_seguranca');
  const seg = (data as Seguranca | null) ?? null;
  if (error) {
    console.error('minha_seguranca:', error);
    return { etapa: 'bloqueado', seg, motivo: `O banco recusou a consulta de acesso (${error.message}). Confira se os scripts 001 e 005 foram rodados.` };
  }
  if (!seg) return { etapa: 'bloqueado', seg, motivo: 'Este login não tem perfil no SIGER RH. Para o primeiro acesso, rode o script 002 com a sua matrícula.' };
  if (!seg.ativo) return { etapa: 'bloqueado', seg, motivo: 'Este acesso está desativado. Procure a Direção ou o RH da sua unidade.' };

  if (seg.mfa_exigido && !seg.mfa_ok) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return { etapa: aal?.nextLevel === 'aal2' ? 'confirmar_mfa' : 'cadastrar_mfa', seg };
  }
  if (seg.deve_trocar_senha) return { etapa: 'trocar_senha', seg };
  return { etapa: 'liberado', seg };
}

/** Trava contra vai e volta entre telas: mais de 4 idas ao Início em 20 segundos = algo errado */
export function idaAoInicioRepetida(): boolean {
  try {
    const agora = Date.now();
    const lista = (JSON.parse(sessionStorage.getItem('siger-rh:idas') ?? '[]') as number[]).filter((t) => agora - t < 20_000);
    lista.push(agora);
    sessionStorage.setItem('siger-rh:idas', JSON.stringify(lista));
    return lista.length > 4;
  } catch {
    return false;
  }
}
export function limparIdas() {
  try { sessionStorage.removeItem('siger-rh:idas'); } catch { /* sem armazenamento */ }
}

/** Regras de senha (as mesmas da Edge Function) */
const COMUNS = ['12345678', '123456789', '1234567890', 'senha123', 'senha1234', 'password1', 'abc12345', 'fspss123', 'mudar123', 'qwerty123'];

export function problemaSenha(senha: string, matricula?: string | null): string | null {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (senha.length > 72) return 'A senha pode ter no máximo 72 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) return 'Use letras e números na senha.';
  if (COMUNS.includes(senha.toLowerCase())) return 'Esta senha é muito fácil de adivinhar. Escolha outra.';
  if (matricula && senha.toLowerCase().includes(matricula.toLowerCase())) return 'A senha não pode conter a sua matrícula.';
  return null;
}

/** Freio no navegador contra tentativas seguidas (o Supabase também limita no servidor) */
const CHAVE_TENTATIVAS = 'siger-rh:tentativas';
type Tentativas = { n: number; ate: number };

function lerTentativas(): Tentativas {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_TENTATIVAS) ?? '') as Tentativas;
  } catch {
    return { n: 0, ate: 0 };
  }
}
export function segundosBloqueado(): number {
  const t = lerTentativas();
  return Math.max(0, Math.ceil((t.ate - Date.now()) / 1000));
}
export function registrarFalha() {
  const t = lerTentativas();
  const n = (t.n ?? 0) + 1;
  // a partir da 5ª falha: espera 30 s, 60 s, 120 s... (até 15 min)
  const ate = n >= 5 ? Date.now() + Math.min(15 * 60, 30 * 2 ** (n - 5)) * 1000 : 0;
  try { localStorage.setItem(CHAVE_TENTATIVAS, JSON.stringify({ n, ate })); } catch { /* sem armazenamento */ }
}
export function zerarFalhas() {
  try { localStorage.removeItem(CHAVE_TENTATIVAS); } catch { /* sem armazenamento */ }
}

/** Última atividade (compartilhada entre as abas abertas) */
const CHAVE_ATIVIDADE = 'siger-rh:atividade';
export function marcarAtividade() {
  try { localStorage.setItem(CHAVE_ATIVIDADE, String(Date.now())); } catch { /* sem armazenamento */ }
}
export function ultimaAtividade(): number {
  try { return Number(localStorage.getItem(CHAVE_ATIVIDADE)) || Date.now(); } catch { return Date.now(); }
}

/** O QR do Supabase vem como SVG puro dentro de um link data:. Codifica para o navegador sempre exibir. */
export function qrSeguro(qr: string) {
  const m = qr.match(/^data:image\/svg\+xml;[^,]*,([\s\S]*)$/);
  const svg = m ? m[1] : qr.trim().startsWith('<svg') ? qr : null;
  if (!svg) return qr;
  let bruto = svg;
  try { bruto = decodeURIComponent(svg); } catch { /* já estava sem codificação */ }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(bruto)}`;
}

/** Cadastro do app autenticador. Nunca roda duas vezes ao mesmo tempo (no modo de desenvolvimento o React
 *  executa a tela duas vezes, e dois cadastros simultâneos se atrapalham). Devolve o motivo real se falhar. */
type CadastroMfa = { fator?: { id: string; qr: string; segredo: string }; erro?: string };
let cadastroEmAndamento: Promise<CadastroMfa> | null = null;

function explicarErroMfa(msg: string) {
  if (/not enabled|disabled|enroll_not_enabled/i.test(msg)) {
    return 'A verificação em duas etapas está desligada no Supabase. Ligue em Authentication > Multi-Factor > TOTP e tente de novo.';
  }
  if (/maximum|too many|exceeded/i.test(msg)) return 'Há cadastros demais pela metade nesta conta. Peça à Direção para usar "Novo celular" no seu cadastro.';
  if (/aal2|assurance/i.test(msg)) return 'Esta conta já tem um app autenticador. Saia, entre de novo e digite o código do app.';
  if (/jwt|session|expired|401/i.test(msg)) return 'A sessão expirou. Saia e entre de novo.';
  return `Não foi possível iniciar o cadastro (${msg}).`;
}

export function iniciarCadastroMfa(supabase: SupabaseClient): Promise<CadastroMfa> {
  if (cadastroEmAndamento) return cadastroEmAndamento;
  cadastroEmAndamento = (async (): Promise<CadastroMfa> => {
    try {
      // descarta cadastros que ficaram pela metade em tentativas anteriores
      const { data: lista } = await supabase.auth.mfa.listFactors();
      for (const f of lista?.all ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const nome = `SIGER RH ${new Date().toLocaleString('pt-BR')} ${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: nome, issuer: 'SIGER RH' });
      if (error || !data) {
        console.error('Cadastro da verificação em duas etapas:', error);
        return { erro: explicarErroMfa(error?.message ?? 'sem resposta do Supabase') };
      }
      return { fator: { id: data.id, qr: qrSeguro(data.totp.qr_code), segredo: data.totp.secret } };
    } catch (e) {
      console.error('Cadastro da verificação em duas etapas:', e);
      return { erro: explicarErroMfa(e instanceof Error ? e.message : String(e)) };
    }
  })();
  // libera para uma nova tentativa depois que esta terminar
  cadastroEmAndamento.finally(() => setTimeout(() => { cadastroEmAndamento = null; }, 1500));
  return cadastroEmAndamento;
}
