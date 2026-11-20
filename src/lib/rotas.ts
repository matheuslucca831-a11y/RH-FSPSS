import {
  Archive, BarChart3, ClipboardCheck, CalendarOff, CheckSquare, History, Home, ListChecks, PlusCircle, Settings, Table2, UserCog, type LucideIcon,
} from 'lucide-react';
import { type Papel } from './types';

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
  /** Para estes papéis, o item só aparece quando há algo na fila de assinaturas */
  soComFila?: Papel[];
};

export const TODOS: Papel[] = ['funcionario', 'enfermeiro', 'gerente', 'supervisor', 'coordenacao', 'diretor', 'rh', 'direcao'];
const CHEFIAS: Papel[] = ['enfermeiro', 'gerente', 'supervisor', 'coordenacao', 'diretor', 'direcao'];
const GESTAO: Papel[] = ['coordenacao', 'rh', 'direcao'];

export const ROTAS: Rota[] = [
  { path: '/inicio',        titulo: 'Início',                 descricao: 'Resumo do que precisa da sua atenção.', icone: Home, papeis: TODOS },
  { path: '/nova',          titulo: 'Nova solicitação',       descricao: 'Ocorrência de ponto, folga, férias, saída antecipada e outros.', curto: 'Nova', icone: PlusCircle, papeis: TODOS },
  { path: '/minhas',        titulo: 'Minhas solicitações',    curto: 'Pedidos', descricao: 'Acompanhe em que etapa estão os seus pedidos.', icone: ListChecks, papeis: TODOS },

  { path: '/aprovacoes',    titulo: 'Para assinar',           curto: 'Assinar', descricao: 'Pedidos aguardando a sua assinatura.', icone: CheckSquare, papeis: TODOS, soComFila: ['funcionario', 'rh'], grupo: 'Análise' },
  { path: '/ausencias',     titulo: 'Ausências',  descricao: 'Férias e afastamentos de quem assina (libera o substituto).', icone: CalendarOff, papeis: CHEFIAS },
  { path: '/decididas',     titulo: 'Minhas assinaturas',     descricao: 'Pedidos que você assinou ou negou.', icone: History, papeis: TODOS, soComFila: ['funcionario', 'rh'] },

  { path: '/todas',         titulo: 'Todas as solicitações',  curto: 'Todas', descricao: 'Acompanhe e filtre os pedidos de todas as unidades.', icone: Table2, papeis: GESTAO, grupo: 'Gestão' },
  { path: '/baixa',         titulo: 'Baixa do RH',            curto: 'Baixa', descricao: 'Pedidos aprovados para dar baixa no sistema do RH.', icone: ClipboardCheck, papeis: ['rh', 'direcao'] },
  { path: '/arquivo',       titulo: 'Arquivo',                descricao: 'Solicitações finalizadas que foram arquivadas.', icone: Archive, papeis: ['direcao'] },
  { path: '/relatorios',    titulo: 'Relatórios',             descricao: 'Resumo do mês por tipo e por unidade.', icone: BarChart3, papeis: GESTAO },
  { path: '/administracao', titulo: 'Administração',          descricao: 'Usuários, fluxos de assinatura, unidades, segurança e auditoria.', icone: Settings, papeis: ['direcao'] },

  { path: '/conta',         titulo: 'Minha conta',            descricao: 'Senha, verificação em duas etapas e sessões.', icone: UserCog, papeis: TODOS, grupo: 'Conta' },
];

export const rotasDo = (papel: Papel) => ROTAS.filter((r) => r.papeis.includes(papel));
