import {
  Archive, BarChart3, CheckSquare, Gavel, History, Home, ListChecks, PlusCircle, Settings, Table2, UserCog, type LucideIcon,
} from 'lucide-react';
import type { Papel } from './types';

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

const TODOS: Papel[] = ['funcionario', 'chefia', 'direcao'];

export const ROTAS: Rota[] = [
  { path: '/inicio',        titulo: 'Início',                 descricao: 'Resumo do que precisa da sua atenção.', icone: Home, papeis: TODOS },
  { path: '/nova',          titulo: 'Nova solicitação',       descricao: 'Peça um ajuste de ponto ou uma folga.', curto: 'Nova', icone: PlusCircle, papeis: TODOS },
  { path: '/minhas',        titulo: 'Minhas solicitações',    curto: 'Pedidos', descricao: 'Acompanhe em que etapa estão os seus pedidos.', icone: ListChecks, papeis: TODOS },

  { path: '/aprovacoes',    titulo: 'Aprovações',             curto: 'Aprovar', descricao: 'Pedidos da sua equipe aguardando a sua análise.', icone: CheckSquare, papeis: ['chefia'], grupo: 'Análise' },
  { path: '/decisoes',      titulo: 'Decisão da Direção',     curto: 'Decidir', descricao: 'Folgas aprovadas pela chefia aguardando a decisão final.', icone: Gavel, papeis: ['direcao'], grupo: 'Análise' },
  { path: '/decididas',     titulo: 'Minhas análises',        descricao: 'Pedidos que você aprovou ou negou.', icone: History, papeis: ['chefia', 'direcao'] },

  { path: '/todas',         titulo: 'Todas as solicitações',  curto: 'Todas', descricao: 'Acompanhe e filtre os pedidos de todas as unidades.', icone: Table2, papeis: ['direcao'], grupo: 'Gestão' },
  { path: '/arquivo',       titulo: 'Arquivo',                descricao: 'Solicitações finalizadas que foram arquivadas.', icone: Archive, papeis: ['direcao'] },
  { path: '/relatorios',    titulo: 'Relatórios',             descricao: 'Resumo do mês por tipo e por unidade.', icone: BarChart3, papeis: ['direcao'] },
  { path: '/administracao', titulo: 'Administração',          descricao: 'Usuários, unidades, segurança e auditoria.', icone: Settings, papeis: ['direcao'] },

  { path: '/conta',         titulo: 'Minha conta',            descricao: 'Senha, verificação em duas etapas e sessões.', icone: UserCog, papeis: TODOS, grupo: 'Conta' },
];

export const rotasDo = (papel: Papel) => ROTAS.filter((r) => r.papeis.includes(papel));
