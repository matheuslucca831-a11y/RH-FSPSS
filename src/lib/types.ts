/** O que a pessoa faz no sistema (quem assina) */
export type Papel = 'funcionario' | 'enfermeiro' | 'gerente' | 'supervisor' | 'coordenacao' | 'direcao';

/** Grupo do cargo de quem pede: decide quem assina (Circular 254/2026) */
export type GrupoCargo = 'geral' | 'farmacia' | 'enfermeiro' | 'gerente';

export type Perfil = {
  id: string;
  nome: string;
  matricula: string;
  email: string | null;
  cargo: string | null;
  papel: Papel;
  grupo_cargo?: GrupoCargo;
  unidade_id: string | null;
  ativo: boolean;
  unidade: { nome: string; sigla: string | null } | null;
  /** Unidades que o Supervisor acompanha */
  supervisiona?: string[];
};

export const PAPEIS: Record<Papel, { rotulo: string; descricao: string }> = {
  funcionario: { rotulo: 'Funcionário', descricao: 'Faz e acompanha as próprias solicitações.' },
  enfermeiro: { rotulo: 'Enfermeiro responsável', descricao: 'Assina os pedidos dos cargos gerais da unidade, junto com o Gerente.' },
  gerente: { rotulo: 'Gerente da unidade', descricao: 'Assina os pedidos da unidade (cargos gerais e enfermeiros).' },
  supervisor: { rotulo: 'Supervisor', descricao: 'Assina no lugar do Enfermeiro ou do Gerente em férias ou afastamento médico.' },
  coordenacao: { rotulo: 'Coordenação de Enfermagem', descricao: 'Avalia os pedidos dos Gerentes e as transferências de lotação.' },
  direcao: { rotulo: 'Direção', descricao: 'Decisão final de folgas, férias e cancelamentos; relatórios e cadastros.' },
};

export const GRUPOS: Record<GrupoCargo, { rotulo: string; descricao: string }> = {
  geral: { rotulo: 'Cargos gerais', descricao: 'Enfermeiro responsável e Gerente assinam (Supervisor na ausência).' },
  farmacia: { rotulo: 'Farmácia', descricao: 'Farmacêutico e Técnico de Farmácia: basta uma chefia da unidade.' },
  enfermeiro: { rotulo: 'Enfermeiro(a)', descricao: 'O Gerente assina (Supervisor na ausência dele).' },
  gerente: { rotulo: 'Gerente de unidade', descricao: 'A Coordenação de Enfermagem avalia.' },
};

/** Sugestão do grupo a partir do cargo digitado */
export function grupoDoCargo(cargo: string, papel: Papel): GrupoCargo {
  const c = cargo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (papel === 'gerente' || c.includes('gerente')) return 'gerente';
  if (c.includes('farm')) return 'farmacia';
  if (papel === 'enfermeiro' || (c.includes('enfermeir') && !/tecnic|auxiliar/.test(c))) return 'enfermeiro';
  return 'geral';
}

/** Papéis que assinam pedidos */
export const ASSINAM: Papel[] = ['enfermeiro', 'gerente', 'supervisor', 'coordenacao', 'direcao'];
/** Papéis sem unidade obrigatória */
export const SEM_UNIDADE: Papel[] = ['supervisor', 'coordenacao', 'direcao'];
