export type Papel = 'funcionario' | 'chefia' | 'direcao';

export type Perfil = {
  id: string;
  nome: string;
  matricula: string;
  email: string | null;
  cargo: string | null;
  papel: Papel;
  unidade_id: string | null;
  ativo: boolean;
  unidade: { nome: string; sigla: string | null } | null;
};

export const PAPEIS: Record<Papel, { rotulo: string; descricao: string }> = {
  funcionario: { rotulo: 'Funcionário', descricao: 'Faz e acompanha as próprias solicitações.' },
  chefia: { rotulo: 'Chefia da unidade', descricao: 'Enfermeiro(a) ou supervisor(a): analisa os pedidos da equipe.' },
  direcao: { rotulo: 'Direção', descricao: 'Decisão final das folgas, relatórios e cadastros.' },
};
