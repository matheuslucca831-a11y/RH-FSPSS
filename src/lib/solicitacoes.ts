import { dataBR } from './formato';
import type { GrupoCargo } from './types';

/** Regras e textos das solicitações. As telas leem daqui; o banco confere as mesmas regras. */
export type Categoria = 'ponto' | 'folga' | 'ferias' | 'cancelamento' | 'saida' | 'estagio' | 'transferencia';
export type Situacao = 'Aguardando assinatura' | 'Aprovado' | 'Negado' | 'Cancelado'
  // situações antigas (pedidos de antes dos fluxos configuráveis)
  | 'Aguardando chefia' | 'Aguardando coordenação' | 'Aguardando direção';

/** Quem assina uma etapa */
export type TipoVaga = 'unidade' | 'papel' | 'cargo' | 'pessoa';
export type VagaFluxo = { tipo: TipoVaga; valor: string; rotulo?: string };
export type Etapa = { nome: string; regra: 'todos' | 'um'; vagas: VagaFluxo[]; substituto: VagaFluxo | null; gozo_imediato: boolean };
/** Caminhos de um modelo: o padrão e, se quiser, um por tipo de pedido */
export type Rotas = { padrao: Etapa[] } & Partial<Record<Categoria, Etapa[]>>;
export type Fluxo = { id: string; nome: string; descricao: string | null; rotas: Rotas; ativo: boolean; atualizado_em?: string };

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

export const SITUACOES: Situacao[] = ['Aguardando assinatura', 'Aprovado', 'Negado', 'Cancelado'];
export const SITUACOES_ABERTAS: Situacao[] = ['Aguardando assinatura'];
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

/** Rótulos das etapas antigas (assinaturas de antes dos fluxos configuráveis guardavam só o código) */
export const ROTULO_VAGA: Record<string, string> = {
  enfermeiro: 'Enfermeiro responsável', gerente: 'Gerente', coordenacao: 'Coordenação de Enfermagem',
  direcao: 'Direção', chefia: 'Chefia', supervisor: 'Supervisor',
};
export const rotuloEtapa = (codigo: string) => ROTULO_VAGA[codigo] ?? codigo;

/** Papéis que podem aparecer como assinantes (tipo "papel") */
export const PAPEIS_ASSINANTES: Record<string, string> = {
  direcao: 'Direção', coordenacao: 'Coordenação de Enfermagem', diretor: 'Diretor(a) de área', rh: 'RH',
  supervisor: 'Supervisor', gerente: 'Gerente', enfermeiro: 'Enfermeiro responsável',
};
/** Cargos na unidade do funcionário (tipo "unidade") */
export const CARGOS_UNIDADE: Record<string, string> = {
  enfermeiro: 'Enfermeiro responsável da unidade', gerente: 'Gerente da unidade', supervisor: 'Supervisor da unidade',
};
export const TIPOS_VAGA: Record<TipoVaga, { rotulo: string; descricao: string }> = {
  unidade: { rotulo: 'Chefia da unidade', descricao: 'Enfermeiro, Gerente ou Supervisor da unidade de quem fez o pedido' },
  papel: { rotulo: 'Papel no sistema', descricao: 'Qualquer pessoa com o papel (ex.: Direção)' },
  cargo: { rotulo: 'Cargo do cadastro', descricao: 'Qualquer pessoa com o cargo escrito' },
  pessoa: { rotulo: 'Pessoa específica', descricao: 'Só essa pessoa assina' },
};
/** Rótulo de uma vaga na tela (para pessoa, passe o mapa id -> nome) */
export function rotuloVaga(v: VagaFluxo, nomes?: Record<string, string>) {
  if (v.rotulo) return v.rotulo;
  if (v.tipo === 'unidade') return CARGOS_UNIDADE[v.valor] ?? 'Chefia da unidade';
  if (v.tipo === 'papel') return PAPEIS_ASSINANTES[v.valor] ?? v.valor;
  if (v.tipo === 'cargo') return `Cargo: ${v.valor}`;
  return nomes?.[v.valor] ?? 'Pessoa específica';
}

export type Assinatura = {
  /** Quem assinou (rótulo da vaga, ou o código antigo) */
  etapa: string;
  etapa_nome: string | null;
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
  situacao: Situacao; pendentes: string[]; gozo_imediato: boolean;
  rota: Etapa[] | null; etapa_atual: number | null; etapa_nome: string | null; fluxo_nome: string | null;
  baixa_em: string | null; baixa_nome: string | null;
  referencia_id: string | null; referencia_protocolo: string | null;
  unidade_destino_id: string | null; unidade_destino_nome: string | null;
  cancelado_em: string | null; arquivado: boolean; arquivado_em: string | null;
  criado_em: string; atualizado_em: string;
  assinaturas: Assinatura[];
};

export const CAMPOS_SOLICITACAO =
  'id, protocolo, categoria, tipo, subtipo, precisa_direcao, data_inicio, data_fim, entrada, saida_almoco, retorno_almoco, saida, ' +
  'justificativa, anexo_bucket, anexo_path, anexo_nome, solicitante_id, solicitante_nome, solicitante_matricula, solicitante_cargo, ' +
  'grupo_solicitante, unidade_id, unidade_nome, situacao, pendentes, gozo_imediato, referencia_id, referencia_protocolo, ' +
  'rota, etapa_atual, etapa_nome, fluxo_nome, baixa_em, baixa_nome, ' +
  'unidade_destino_id, unidade_destino_nome, cancelado_em, arquivado, arquivado_em, criado_em, atualizado_em, ' +
  'assinaturas(etapa, etapa_nome, decisao, nome, papel, substituicao, obs, criado_em)';

/** Item da fila de assinaturas (função fila_assinaturas do banco) */
export type ItemFila = {
  id: string;
  /** titular: ocupa uma vaga pendente; substituto: assina no lugar de uma vaga ausente; direcao_direta: decide sem a etapa */
  como: 'titular' | 'substituto' | 'direcao_direta';
  /** números das vagas (na etapa atual) que esta pessoa pode assinar */
  vagas: string[];
  rotulos: string[];
  /** vagas pendentes sem ninguém disponível hoje */
  ausentes: string[];
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

/** Texto de quem assina uma etapa: 'Enfermeiro e Gerente', 'Enfermeiro ou Gerente (basta um)' */
export function quemAssina(e: Etapa, nomes?: Record<string, string>) {
  const r = e.vagas.map((v) => rotuloVaga(v, nomes));
  const lista = r.length <= 1 ? r.join('') : `${r.slice(0, -1).join(', ')} ${e.regra === 'um' ? 'ou' : 'e'} ${r.at(-1)}`;
  return e.regra === 'um' && r.length > 1 ? `${lista} (basta um)` : lista;
}

export type Passo = { titulo: string; detalhe?: string | null; data: string | null; estado: 'feito' | 'atual' | 'pendente' | 'negado' | 'cancelado' };

/** Etapas do pedido, para a linha do tempo dos cartões */
export function linhaDoTempo(s: Solicitacao): Passo[] {
  const passos: Passo[] = [{ titulo: 'Enviada', data: s.criado_em, estado: 'feito' }];
  const ass = [...(s.assinaturas ?? [])].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  for (const a of ass) {
    passos.push({
      titulo: rotuloEtapa(a.etapa),
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

  if (emAnalise(s) && s.rota) {
    const atual = s.etapa_atual ?? 0;
    const et = s.rota[atual];
    if (et) {
      if (et.regra === 'um' && et.vagas.length > 1) passos.push({ titulo: et.nome, detalhe: quemAssina(et), data: null, estado: 'atual' });
      else for (const i of s.pendentes ?? []) {
        const v = et.vagas[+i];
        if (v) passos.push({ titulo: rotuloVaga(v), detalhe: et.nome, data: null, estado: 'atual' });
      }
    }
    for (const e of s.rota.slice(atual + 1)) passos.push({ titulo: e.nome, detalhe: quemAssina(e), data: null, estado: 'pendente' });
  } else if (emAnalise(s)) {
    passos.push({ titulo: s.situacao.replace('Aguardando ', 'Aguardando a '), data: null, estado: 'atual' });
  }
  passos.push({
    titulo: 'Concluída',
    data: s.situacao === 'Aprovado' ? ass.at(-1)?.criado_em ?? null : null,
    estado: s.situacao === 'Aprovado' ? 'feito' : 'pendente',
  });
  if (s.situacao === 'Aprovado' && s.baixa_em) passos.push({ titulo: 'Baixa no RH', detalhe: s.baixa_nome, data: s.baixa_em, estado: 'feito' });
  return passos;
}

/** O que falta na etapa atual: 'a assinatura de Gerente da unidade' */
export function falta(s: Solicitacao) {
  const et = s.rota?.[s.etapa_atual ?? 0];
  if (!et) return 'a assinatura';
  if (et.regra === 'um' && et.vagas.length > 1) return `a assinatura de ${quemAssina(et)}`;
  const r = (s.pendentes ?? []).map((i) => et.vagas[+i]).filter(Boolean).map((v) => rotuloVaga(v));
  return `a assinatura de ${r.length > 1 ? `${r.slice(0, -1).join(', ')} e ${r.at(-1)}` : r[0] ?? et.nome}`;
}

/** Frase simples sobre a situação do pedido */
export function frase(s: Solicitacao) {
  const ass = [...(s.assinaturas ?? [])].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const ultima = ass.at(-1);
  const quem = (a?: Assinatura) => (a ? `${rotuloEtapa(a.etapa)}: ${a.nome}` : '');
  switch (s.situacao) {
    case 'Aprovado':
      return `Aprovada (${quem(ultima)}) em ${dataCurta(ultima?.criado_em ?? s.atualizado_em)}.${ultima?.obs ? ` Observação: ${ultima.obs}` : ''}`
        + (s.baixa_em ? ` Baixa no RH em ${dataCurta(s.baixa_em)}.` : '');
    case 'Negado':
      return `Negada (${quem(ultima)}) em ${dataCurta(ultima?.criado_em ?? s.atualizado_em)}.${ultima?.obs ? ` Motivo: ${ultima.obs}` : ''}`;
    case 'Cancelado':
      return `Cancelada em ${dataCurta(s.cancelado_em)}.`;
    default: {
      const inicio = ass.length ? `Assinada por ${ass.map((a) => a.nome).join(', ')}. ` : `Enviada em ${dataCurta(s.criado_em)}. `;
      if (!s.rota) return `${inicio}${s.situacao}.`;
      const total = s.rota.length;
      const etapa = total > 1 ? ` (etapa ${(s.etapa_atual ?? 0) + 1} de ${total}: ${s.etapa_nome ?? ''})` : '';
      return `${inicio}Aguardando ${falta(s)}${etapa}.`;
    }
  }
}

/** Frase curta para quem vai analisar: quem já assinou e quem falta, sem "etapa" nem "fluxo" */
export function fraseCurta(s: Solicitacao, semFalta = false) {
  if (!emAnalise(s) || !s.rota) return frase(s);
  const ass = [...(s.assinaturas ?? [])].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const ja = ass.length ? `Já assinou: ${ass.map((a) => a.nome.split(' ')[0]).join(', ')}.` : '';
  if (semFalta) return ja; // quem vai assinar já vê o que falta logo abaixo, junto dos botões
  const f = falta(s).replace(/^a assinatura de /, '').replace(/^a assinatura$/, 'assinatura');
  return `${ja ? `${ja} ` : ''}Falta: ${f}.`;
}

/** Nome de arquivo seguro para o Storage */
export function nomeArquivoSeguro(nome: string) {
  const ext = (nome.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'pdf').toLowerCase();
  const base = nome.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';
  return `${base}.${ext}`;
}
