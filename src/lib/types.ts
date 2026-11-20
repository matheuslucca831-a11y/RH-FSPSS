/** O que a pessoa faz no sistema (quem assina) */
export type Papel = 'funcionario' | 'enfermeiro' | 'gerente' | 'supervisor' | 'coordenacao' | 'diretor' | 'rh' | 'direcao';

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
  /** Modelo de fluxo de assinatura que vale para os pedidos desta pessoa */
  fluxo_id?: string | null;
  unidade_id: string | null;
  ativo: boolean;
  unidade: { nome: string; sigla: string | null } | null;
  /** Unidades vinculadas além da lotação (Supervisor, Enfermeiro responsável e Gerente) */
  supervisiona?: string[];
};

export const PAPEIS: Record<Papel, { rotulo: string; descricao: string }> = {
  funcionario: { rotulo: 'Funcionário', descricao: 'Faz e acompanha as próprias solicitações.' },
  enfermeiro: { rotulo: 'Enfermeiro responsável', descricao: 'Assina os pedidos dos cargos gerais da unidade, junto com o Gerente.' },
  gerente: { rotulo: 'Gerente da unidade', descricao: 'Assina os pedidos da unidade (cargos gerais e enfermeiros).' },
  supervisor: { rotulo: 'Supervisor', descricao: 'Assina no lugar do Enfermeiro ou do Gerente em férias ou afastamento médico.' },
  coordenacao: { rotulo: 'Coordenação de Enfermagem', descricao: 'Avalia os pedidos dos Gerentes e as transferências de lotação.' },
  diretor: { rotulo: 'Diretor(a) de área', descricao: 'Assina os pedidos dos fluxos em que aparece, sem administrar o sistema.' },
  rh: { rotulo: 'RH', descricao: 'Vê os pedidos e dá baixa nos aprovados.' },
  direcao: { rotulo: 'Direção', descricao: 'Administra o sistema: cadastros, fluxos de assinatura e relatórios. Pode decidir direto.' },
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
export const ASSINAM: Papel[] = ['enfermeiro', 'gerente', 'supervisor', 'coordenacao', 'diretor', 'direcao'];
/** Papéis sem unidade obrigatória */
export const SEM_UNIDADE: Papel[] = ['supervisor', 'coordenacao', 'diretor', 'rh', 'direcao'];
