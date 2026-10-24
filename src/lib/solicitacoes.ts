import { dataBR } from './formato';
import type { GrupoCargo, Papel } from './types';

/** Regras e textos das solicitações. As telas leem daqui; o banco confere as mesmas regras. */
export type Categoria = 'ponto' | 'folga' | 'ferias' | 'cancelamento' | 'saida' | 'estagio' | 'transferencia';
export type Situacao = 'Aguardando chefia' | 'Aguardando coordenação' | 'Aguardando direção' | 'Aprovado' | 'Negado' | 'Cancelado';
export type Vaga = 'enfermeiro' | 'gerente';
export type Fluxo = 'ambos' | 'um' | 'saida_estagio' | 'coordenacao' | 'direcao';

export const CATEGORIAS: Record<Categoria, { titulo: string; descricao: string; tipos: string[] }> = {
  ponto: {
    titulo: 'Ocorrência de ponto',
    descricao: 'Esquecimento de marcação, atestado ou erro no relógio.',
    tipos: ['Esquecimento', 'Atestado', 'Erro no relógio', 'Outros'],
  },
  folga: {
    titulo: 'Folga',
    descricao: 'Banco de horas, folga abonada, serviço eleitoral e outras.',
    tipos: ['Banco de horas', 'Folga abonada (Art. 56, XII)', 'Serviço eleitoral (TRE)', 'Campanha de vacinação',
      'Abono natalício (Art. 56, X)', 'Outros'],
  },
  ferias: { titulo: 'Férias', descricao: 'Período de férias.', tipos: ['Férias'] },
  cancelamento: {
    titulo: 'Cancelamento',
    descricao: 'Cancelar uma folga ou férias que já foram aprovadas.',
    tipos: ['Cancelamento de folga', 'Cancelamento de férias'],
  },
  saida: { titulo: 'Saída antecipada', descricao: 'Sair antes do fim do expediente.', tipos: ['Saída antecipada'] },
  estagio: { titulo: 'Estágio', descricao: 'Solicitação de estágio.', tipos: ['Solicitação de estágio'] },
  transferencia: {
    titulo: 'Transferência de lotação',
    descricao: 'Mudar de unidade. Vai direto à Coordenação / Direção.',
    tipos: ['Transferência de lotação'],
  },
};

export const SUBTIPOS_ATESTADO = ['Médico', 'Acompanhante', 'Comparecimento', 'Doação de sangue'];

export const SITUACOES: Situacao[] = ['Aguardando chefia', 'Aguardando coordenação', 'Aguardando direção', 'Aprovado', 'Negado', 'Cancelado'];
export const SITUACOES_ABERTAS: Situacao[] = ['Aguardando chefia', 'Aguardando coordenação', 'Aguardando direção'];
export const SITUACOES_FINAIS: Situacao[] = ['Aprovado', 'Negado', 'Cancelado'];
export const emAnalise = (s: { situacao: Situacao }) => s.situacao.startsWith('Aguardando');

export const anexoObrigatorio = (_categoria: Categoria, tipo: string) =>
  tipo === 'Atestado' || tipo === 'Serviço eleitoral (TRE)';
export const pedeHorarios = (categoria: Categoria, tipo: string) => categoria === 'ponto' && tipo !== 'Atestado';
/** Tipos com uma data só */
export const umDia = (categoria: Categoria) => categoria === 'saida' || categoria === 'transferencia';

export const ANEXO_TIPOS = ['application/pdf', 'image/png', 'image/jpeg'];
export const ANEXO_MAX_MB = 10;

export const MOTIVOS_AUSENCIA = ['Férias', 'Afastamento médico'] as const;
export type MotivoAusencia = (typeof MOTIVOS_AUSENCIA)[number];

export const ROTULO_VAGA: Record<string, string> = {
  enfermeiro: 'Enfermeiro responsável', gerente: 'Gerente', coordenacao: 'Coordenação de Enfermagem',
  direcao: 'Direção', chefia: 'Chefia', supervisor: 'Supervisor',
};

export type Assinatura = {
  etapa: 'chefia' | Vaga | 'coordenacao' | 'direcao';
  decisao: 'Aprovado' | 'Negado';
  nome: string; papel: string; substituicao: string | null; obs: string | null; criado_em: string;
};

export type Solicitacao = {
  id: string; protocolo: string; categoria: Categoria; tipo: string; subtipo: string | null; precisa_direcao: boolean;
  data_inicio: string; data_fim: string;
  entrada: string | null; saida_almoco: string | null; retorno_almoco: string | null; saida: string | null;
  justificativa: string | null; anexo_bucket: 'comprovantes' | 'anexos'; anexo_path: string | null; anexo_nome: string | null;
  solicitante_id: string; solicitante_nome: string; solicitante_matricula: string | null; solicitante_cargo: string | null;
  grupo_solicitante: GrupoCargo | null;
  unidade_id: string | null; unidade_nome: string | null;
  situacao: Situacao; fluxo: Fluxo | null; pendentes: Vaga[]; gozo_imediato: boolean;
  referencia_id: string | null; referencia_protocolo: string | null;
  unidade_destino_id: string | null; unidade_destino_nome: string | null;
  cancelado_em: string | null; arquivado: boolean; arquivado_em: string | null;
  criado_em: string; atualizado_em: string;
  assinaturas: Assinatura[];
};

export const CAMPOS_SOLICITACAO =
  'id, protocolo, categoria, tipo, subtipo, precisa_direcao, data_inicio, data_fim, entrada, saida_almoco, retorno_almoco, saida, ' +
  'justificativa, anexo_bucket, anexo_path, anexo_nome, solicitante_id, solicitante_nome, solicitante_matricula, solicitante_cargo, ' +
  'grupo_solicitante, unidade_id, unidade_nome, situacao, fluxo, pendentes, gozo_imediato, referencia_id, referencia_protocolo, ' +
  'unidade_destino_id, unidade_destino_nome, cancelado_em, arquivado, arquivado_em, criado_em, atualizado_em, ' +
  'assinaturas(etapa, decisao, nome, papel, substituicao, obs, criado_em)';

/** Item da fila de assinaturas (função fila_assinaturas do banco) */
export type ItemFila = {
  id: string;
  como: 'titular' | 'gerente_substituto' | 'supervisor' | 'coordenacao' | 'direcao';
  vagas: Vaga[];
  ausentes: Vaga[];
  precisa_motivo: boolean;
};

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
/** Horários informados (ocorrência de ponto ou saída antecipada) */
export function horarios(s: Pick<Solicitacao, 'categoria' | 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida'>) {
  if (s.categoria === 'saida') return s.saida ? [{ rotulo: 'Sai às', hora: h(s.saida)! }] : [];
  return ([['Entrada', s.entrada], ['Saída almoço', s.saida_almoco], ['Retorno almoço', s.retorno_almoco], ['Saída', s.saida]] as const)
    .filter(([, v]) => v)
    .map(([r, v]) => ({ rotulo: r, hora: h(v)! }));
}

/**
 * Caminho que um pedido vai percorrer (o mesmo cálculo do banco, função rota_pedido).
 * Serve para mostrar as etapas antes de enviar.
 */
export function rota(papel: Papel, grupo: GrupoCargo, categoria: Categoria): { fluxo: Fluxo; vagas: Vaga[]; coordenacao: boolean; direcao: boolean } {
  const direcao = ['folga', 'ferias', 'cancelamento'].includes(categoria);
  if (categoria === 'transferencia') return { fluxo: 'coordenacao', vagas: [], coordenacao: true, direcao: false };
  if (['supervisor', 'coordenacao', 'direcao'].includes(papel)) return { fluxo: 'direcao', vagas: [], coordenacao: false, direcao: true };
  if (papel === 'gerente' || grupo === 'gerente') return { fluxo: 'coordenacao', vagas: [], coordenacao: true, direcao };
  if (papel === 'enfermeiro' || grupo === 'enfermeiro') return { fluxo: 'ambos', vagas: ['gerente'], coordenacao: false, direcao };
  if (categoria === 'saida' || categoria === 'estagio') return { fluxo: 'saida_estagio', vagas: ['enfermeiro'], coordenacao: false, direcao };
  if (grupo === 'farmacia') return { fluxo: 'um', vagas: ['enfermeiro', 'gerente'], coordenacao: false, direcao };
  return { fluxo: 'ambos', vagas: ['enfermeiro', 'gerente'], coordenacao: false, direcao };
}

/** Texto curto de cada etapa de assinatura da unidade */
export function etapasUnidade(fluxo: Fluxo, vagas: Vaga[]): string[] {
  if (fluxo === 'um') return ['Enfermeiro responsável ou Gerente assina (basta um)'];
  if (fluxo === 'saida_estagio') return ['Enfermeiro responsável assina (o Gerente só na ausência dele)'];
  return vagas.map((v) => `${ROTULO_VAGA[v]} assina`);
}

export type Passo = { titulo: string; detalhe?: string | null; data: string | null; estado: 'feito' | 'atual' | 'pendente' | 'negado' | 'cancelado' };

/** Etapas do pedido, para a linha do tempo dos cartões */
export function linhaDoTempo(s: Solicitacao): Passo[] {
  const passos: Passo[] = [{ titulo: 'Enviada', data: s.criado_em, estado: 'feito' }];
  const ass = [...(s.assinaturas ?? [])].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  for (const a of ass) {
    passos.push({
      titulo: ROTULO_VAGA[a.etapa] ?? a.etapa,
      detalhe: a.substituicao ? `${a.nome} (${a.substituicao.split(' (')[0]})` : a.nome,
      data: a.criado_em,
      estado: a.decisao === 'Negado' ? 'negado' : 'feito',
    });
  }
  if (s.situacao === 'Cancelado') {
    passos.push({ titulo: 'Cancelada', data: s.cancelado_em, estado: 'cancelado' });
    return passos;
  }
  if (s.situacao === 'Negado') return passos;

  const assinadas = new Set(ass.map((a) => a.etapa));
  if (s.situacao === 'Aguardando chefia') {
    if (s.fluxo === 'um') passos.push({ titulo: 'Chefia da unidade', detalhe: 'Enfermeiro ou Gerente', data: null, estado: 'atual' });
    else for (const v of s.pendentes) passos.push({ titulo: ROTULO_VAGA[v], data: null, estado: 'atual' });
  }
  if (s.situacao === 'Aguardando coordenação') passos.push({ titulo: ROTULO_VAGA.coordenacao, data: null, estado: 'atual' });
  if (s.situacao === 'Aguardando direção') passos.push({ titulo: 'Direção', data: null, estado: 'atual' });
  else if (s.situacao !== 'Aprovado' && s.precisa_direcao && !assinadas.has('direcao')) {
    passos.push({ titulo: 'Direção', data: null, estado: 'pendente' });
  }
  passos.push({
    titulo: 'Concluída',
    data: s.situacao === 'Aprovado' ? ass.at(-1)?.criado_em ?? null : null,
    estado: s.situacao === 'Aprovado' ? 'feito' : 'pendente',
  });
  return passos;
}

/** Frase simples sobre a situação do pedido */
export function frase(s: Solicitacao) {
  const ass = [...(s.assinaturas ?? [])].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const ultima = ass.at(-1);
  const quem = (a?: Assinatura) => (a ? `${ROTULO_VAGA[a.etapa] ?? a.etapa}: ${a.nome}` : '');
  switch (s.situacao) {
    case 'Aguardando chefia': {
      const falta = s.fluxo === 'um' ? 'a assinatura do Enfermeiro responsável ou do Gerente'
        : s.pendentes.map((v) => ROTULO_VAGA[v]).join(' e ');
      return `${ass.length ? `Assinada por ${ass.map((a) => a.nome).join(', ')}. ` : `Enviada em ${dataCurta(s.criado_em)}. `}Aguardando ${s.fluxo === 'um' ? falta : `a assinatura de ${falta}`}.`;
    }
    case 'Aguardando coordenação':
      return `Enviada em ${dataCurta(s.criado_em)}. Aguardando a avaliação da Coordenação de Enfermagem${s.categoria === 'transferencia' ? ' / Direção' : ''}.`;
    case 'Aguardando direção':
      return ass.length
        ? `Assinada por ${ass.map((a) => a.nome).join(', ')}. Aguardando a decisão final da Direção.`
        : `Enviada direto à Direção em ${dataCurta(s.criado_em)}. Aguardando a decisão.`;
    case 'Aprovado':
      return `Aprovada (${quem(ultima)}) em ${dataCurta(ultima?.criado_em ?? s.atualizado_em)}.${ultima?.obs ? ` Observação: ${ultima.obs}` : ''}`;
    case 'Negado':
      return `Negada (${quem(ultima)}) em ${dataCurta(ultima?.criado_em ?? s.atualizado_em)}.${ultima?.obs ? ` Motivo: ${ultima.obs}` : ''}`;
    case 'Cancelado':
      return `Cancelada em ${dataCurta(s.cancelado_em)}.`;
  }
}

/** Nome de arquivo seguro para o Storage */
export function nomeArquivoSeguro(nome: string) {
  const ext = (nome.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'pdf').toLowerCase();
  const base = nome.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';
  return `${base}.${ext}`;
}
