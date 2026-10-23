import { dataBR } from './formato';

/** Regras e textos das solicitações. As telas leem daqui; o banco confere as mesmas regras. */
export type Categoria = 'ponto' | 'folga';
export type Situacao = 'Aguardando chefia' | 'Aguardando direção' | 'Aprovado' | 'Negado' | 'Cancelado';

export const CATEGORIAS: Record<Categoria, { titulo: string; descricao: string; tipos: string[] }> = {
  ponto: {
    titulo: 'Ajuste de ponto',
    descricao: 'Esquecimento de marcação, atestado ou erro no relógio. Analisado pela chefia da unidade.',
    tipos: ['Esquecimento', 'Atestado', 'Erro no relógio', 'Outros'],
  },
  folga: {
    titulo: 'Folga',
    descricao: 'Banco de horas, folga abonada, serviço eleitoral e outras. Passa pela chefia e pela Direção.',
    tipos: ['Banco de horas', 'Folga abonada (Art. 56, XII)', 'Serviço eleitoral (TRE)', 'Campanha de vacinação',
      'Abono natalício (Art. 56, X)', 'Outros'],
  },
};

export const SUBTIPOS_ATESTADO = ['Médico', 'Acompanhante', 'Comparecimento', 'Doação de sangue'];

export const SITUACOES: Situacao[] = ['Aguardando chefia', 'Aguardando direção', 'Aprovado', 'Negado', 'Cancelado'];
export const SITUACOES_ABERTAS: Situacao[] = ['Aguardando chefia', 'Aguardando direção'];
export const SITUACOES_FINAIS: Situacao[] = ['Aprovado', 'Negado', 'Cancelado'];

export const anexoObrigatorio = (categoria: Categoria, tipo: string) =>
  tipo === 'Atestado' || tipo === 'Serviço eleitoral (TRE)';
export const pedeHorarios = (categoria: Categoria, tipo: string) => categoria === 'ponto' && tipo !== 'Atestado';

export const ANEXO_TIPOS = ['application/pdf', 'image/png', 'image/jpeg'];
export const ANEXO_MAX_MB = 10;

export type Solicitacao = {
  id: string; protocolo: string; categoria: Categoria; tipo: string; subtipo: string | null; precisa_direcao: boolean;
  data_inicio: string; data_fim: string;
  entrada: string | null; saida_almoco: string | null; retorno_almoco: string | null; saida: string | null;
  justificativa: string | null; anexo_bucket: 'comprovantes' | 'anexos'; anexo_path: string | null; anexo_nome: string | null;
  solicitante_id: string; solicitante_nome: string; solicitante_matricula: string | null; solicitante_cargo: string | null;
  unidade_id: string | null; unidade_nome: string | null;
  situacao: Situacao;
  chefia_decisao: 'Aprovado' | 'Negado' | null; chefia_nome: string | null; chefia_em: string | null; chefia_obs: string | null;
  direcao_decisao: 'Aprovado' | 'Negado' | null; direcao_nome: string | null; direcao_em: string | null; direcao_obs: string | null;
  cancelado_em: string | null; arquivado: boolean; arquivado_em: string | null;
  criado_em: string; atualizado_em: string;
};

export const CAMPOS_SOLICITACAO =
  'id, protocolo, categoria, tipo, subtipo, precisa_direcao, data_inicio, data_fim, entrada, saida_almoco, retorno_almoco, saida, ' +
  'justificativa, anexo_bucket, anexo_path, anexo_nome, solicitante_id, solicitante_nome, solicitante_matricula, solicitante_cargo, ' +
  'unidade_id, unidade_nome, situacao, chefia_decisao, chefia_nome, chefia_em, chefia_obs, direcao_decisao, direcao_nome, direcao_em, ' +
  'direcao_obs, cancelado_em, arquivado, arquivado_em, criado_em, atualizado_em';

export type ItemHistorico = { id: number; acao: string; detalhe: string | null; usuario_nome: string | null; criado_em: string };

/** Data de um timestamp no fuso local: '23/10/2026' */
export const dataCurta = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

/** Quantos dias o período cobre (contando o primeiro e o último) */
export function qtdDias(inicio: string, fim: string) {
  const a = Date.UTC(+inicio.slice(0, 4), +inicio.slice(5, 7) - 1, +inicio.slice(8, 10));
  const b = Date.UTC(+fim.slice(0, 4), +fim.slice(5, 7) - 1, +fim.slice(8, 10));
  return Math.round((b - a) / 86_400_000) + 1;
}

/** '20/10/2026' ou '20/10/2026 a 22/10/2026 (3 dias)' */
export function periodo(s: Pick<Solicitacao, 'data_inicio' | 'data_fim'>) {
  if (!s.data_fim || s.data_fim === s.data_inicio) return dataBR(s.data_inicio);
  return `${dataBR(s.data_inicio)} a ${dataBR(s.data_fim)} (${qtdDias(s.data_inicio, s.data_fim)} dias)`;
}

/** 'Atestado (Médico)' */
export const rotuloTipo = (s: Pick<Solicitacao, 'tipo' | 'subtipo'>) => (s.subtipo ? `${s.tipo} (${s.subtipo})` : s.tipo);

const h = (t: string | null) => (t ? t.slice(0, 5) : null);
/** Horários informados no ajuste de ponto */
export function horarios(s: Pick<Solicitacao, 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida'>) {
  return ([['Entrada', s.entrada], ['Saída almoço', s.saida_almoco], ['Retorno almoço', s.retorno_almoco], ['Saída', s.saida]] as const)
    .filter(([, v]) => v)
    .map(([r, v]) => ({ rotulo: r, hora: h(v)! }));
}

export type Passo = { titulo: string; data: string | null; estado: 'feito' | 'atual' | 'pendente' | 'negado' | 'cancelado' };

/** Etapas do pedido, para a linha do tempo dos cartões */
export function linhaDoTempo(s: Solicitacao): Passo[] {
  const passos: Passo[] = [{ titulo: 'Enviada', data: s.criado_em, estado: 'feito' }];
  if (s.situacao === 'Cancelado') {
    passos.push({ titulo: 'Cancelada', data: s.cancelado_em, estado: 'cancelado' });
    return passos;
  }
  if (s.chefia_decisao || s.situacao === 'Aguardando chefia') {
    passos.push({
      titulo: 'Chefia',
      data: s.chefia_em,
      estado: s.chefia_decisao === 'Aprovado' ? 'feito' : s.chefia_decisao === 'Negado' ? 'negado' : 'atual',
    });
  }
  if (s.chefia_decisao !== 'Negado' && (s.precisa_direcao || s.direcao_decisao || s.situacao === 'Aguardando direção')) {
    passos.push({
      titulo: 'Direção',
      data: s.direcao_em,
      estado: s.direcao_decisao === 'Aprovado' ? 'feito' : s.direcao_decisao === 'Negado' ? 'negado'
        : s.situacao === 'Aguardando direção' ? 'atual' : 'pendente',
    });
  }
  if (s.situacao !== 'Negado') {
    passos.push({ titulo: 'Concluída', data: s.situacao === 'Aprovado' ? s.direcao_em ?? s.chefia_em : null, estado: s.situacao === 'Aprovado' ? 'feito' : 'pendente' });
  }
  return passos;
}

/** Frase simples sobre a situação do pedido */
export function frase(s: Solicitacao) {
  const motivo = (t: string | null) => (t ? ` Motivo: ${t}` : '');
  switch (s.situacao) {
    case 'Aguardando chefia':
      return `Enviada em ${dataCurta(s.criado_em)}. Aguardando a análise da chefia da unidade.`;
    case 'Aguardando direção':
      return s.chefia_decisao === 'Aprovado'
        ? `Aprovada pela chefia (${s.chefia_nome}) em ${dataCurta(s.chefia_em)}. Aguardando a decisão da Direção.`
        : `Enviada direto à Direção em ${dataCurta(s.criado_em)}. Aguardando a decisão.`;
    case 'Aprovado':
      return s.direcao_decisao
        ? `Aprovada pela Direção (${s.direcao_nome}) em ${dataCurta(s.direcao_em)}.${s.direcao_obs ? ` Observação: ${s.direcao_obs}` : ''}`
        : `Aprovada pela chefia (${s.chefia_nome}) em ${dataCurta(s.chefia_em)}.${s.chefia_obs ? ` Observação: ${s.chefia_obs}` : ''}`;
    case 'Negado':
      return s.direcao_decisao === 'Negado'
        ? `Negada pela Direção (${s.direcao_nome}) em ${dataCurta(s.direcao_em)}.${motivo(s.direcao_obs)}`
        : `Negada pela chefia (${s.chefia_nome}) em ${dataCurta(s.chefia_em)}.${motivo(s.chefia_obs)}`;
    case 'Cancelado':
      return `Cancelada por quem pediu em ${dataCurta(s.cancelado_em)}.`;
  }
}

/** Nome de arquivo seguro para o Storage */
export function nomeArquivoSeguro(nome: string) {
  const ext = (nome.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'pdf').toLowerCase();
  const base = nome.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';
  return `${base}.${ext}`;
}
