import {
  Archive, BarChart3, CalendarOff, CheckSquare, History, Home, ListChecks, PlusCircle, Settings, Table2, UserCog, type LucideIcon,
} from 'lucide-react';
import { ASSINAM, type Papel } from './types';

export type Rota = {
  path: string;
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  papeis: Papel[];
  /** Rótulo curto da barra inferior no celular */
  curto?: string;
  /** Começa um novo grupo no menu */
  grupo?: string;
};

const TODOS: Papel[] = ['funcionario', 'enfermeiro', 'gerente', 'supervisor', 'coordenacao', 'direcao'];
const CHEFIAS: Papel[] = ['enfermeiro', 'gerente', 'supervisor', 'coordenacao', 'direcao'];
const GESTAO: Papel[] = ['coordenacao', 'direcao'];

export const ROTAS: Rota[] = [
  { path: '/inicio',        titulo: 'Início',                 descricao: 'Resumo do que precisa da sua atenção.', icone: Home, papeis: TODOS },
  { path: '/nova',          titulo: 'Nova solicitação',       descricao: 'Ocorrência de ponto, folga, férias, saída antecipada e outros.', curto: 'Nova', icone: PlusCircle, papeis: TODOS },
  { path: '/minhas',        titulo: 'Minhas solicitações',    curto: 'Pedidos', descricao: 'Acompanhe em que etapa estão os seus pedidos.', icone: ListChecks, papeis: TODOS },

  { path: '/aprovacoes',    titulo: 'Para assinar',           curto: 'Assinar', descricao: 'Pedidos aguardando a sua assinatura.', icone: CheckSquare, papeis: ASSINAM, grupo: 'Análise' },
  { path: '/ausencias',     titulo: 'Ausências das chefias',  descricao: 'Férias e afastamentos de Enfermeiros e Gerentes (libera o substituto).', icone: CalendarOff, papeis: CHEFIAS },
  { path: '/decididas',     titulo: 'Minhas assinaturas',     descricao: 'Pedidos que você assinou ou negou.', icone: History, papeis: ASSINAM },

  { path: '/todas',         titulo: 'Todas as solicitações',  curto: 'Todas', descricao: 'Acompanhe e filtre os pedidos de todas as unidades.', icone: Table2, papeis: GESTAO, grupo: 'Gestão' },
  { path: '/arquivo',       titulo: 'Arquivo',                descricao: 'Solicitações finalizadas que foram arquivadas.', icone: Archive, papeis: ['direcao'] },
  { path: '/relatorios',    titulo: 'Relatórios',             descricao: 'Resumo do mês por tipo e por unidade.', icone: BarChart3, papeis: GESTAO },
  { path: '/administracao', titulo: 'Administração',          descricao: 'Usuários, unidades, segurança e auditoria.', icone: Settings, papeis: ['direcao'] },

  { path: '/conta',         titulo: 'Minha conta',            descricao: 'Senha, verificação em duas etapas e sessões.', icone: UserCog, papeis: TODOS, grupo: 'Conta' },
];

export const rotasDo = (papel: Papel) => ROTAS.filter((r) => r.papeis.includes(papel));
