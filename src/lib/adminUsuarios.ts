import { chamarFuncao } from '@/lib/funcoes';
import { emailDaMatricula } from '@/lib/login';
import type { Papel } from '@/lib/types';

/** Ações de usuário pela Edge Function "rh-usuarios" (a chave secreta fica só no Supabase) */
export type NovoUsuario = {
  nome: string; matricula: string; senha: string; cargo: string; papel: Papel; unidade_id: string | null;
};

const FUNCAO = 'rh-usuarios';
const chamar = (corpo: Record<string, unknown>) => chamarFuncao(FUNCAO, corpo);

export const criarUsuario = (d: NovoUsuario) =>
  chamar({ acao: 'criar', ...d, matricula: d.matricula.trim(), email: emailDaMatricula(d.matricula) });
export const redefinirSenha = (usuarioId: string, senha: string) => chamar({ acao: 'senha', usuario_id: usuarioId, senha });
export const mudarMatricula = (usuarioId: string, matricula: string) =>
  chamar({ acao: 'matricula', usuario_id: usuarioId, matricula: matricula.trim(), email: emailDaMatricula(matricula) });
/** Desativar também bloqueia o login no Supabase e encerra as sessões abertas */
export const definirAtivo = (usuarioId: string, ativo: boolean) => chamar({ acao: 'ativo', usuario_id: usuarioId, ativo });
/** Para quem trocou ou perdeu o celular: apaga o app autenticador cadastrado */
export const liberarNovoCelular = (usuarioId: string) => chamar({ acao: 'mfa_reset', usuario_id: usuarioId });

/** Senha temporária forte e fácil de ditar (sem letras parecidas) */
export function gerarSenhaTemporaria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const pega = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  const parte = () => Array.from({ length: 4 }, () => pega(letras)).join('');
  return `${parte()}${pega(numeros)}${pega(numeros)}${parte()}`.replace(/^./, (c) => c.toUpperCase());
}
