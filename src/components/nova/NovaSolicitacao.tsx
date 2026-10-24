'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight, CalendarClock, CalendarX, CheckCircle2, DoorOpen, FileUp, Fingerprint, GraduationCap, PlusCircle, Trash2, TreePalm,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hojeISO, mensagemErro } from '@/lib/formato';
import { limparCacheTelas } from '@/lib/cacheTela';
import {
  ANEXO_MAX_MB, ANEXO_TIPOS, CATEGORIAS, SUBTIPOS_ATESTADO, anexoObrigatorio, etapasUnidade, nomeArquivoSeguro, pedeHorarios, periodo,
  rota, rotuloTipo, umDia, type Categoria,
} from '@/lib/solicitacoes';
import { dataBR } from '@/lib/formato';
import type { Perfil } from '@/lib/types';
import { Aviso, Botao, Cabecalho, Campo, inputCls } from '@/components/ui';

type Form = {
  categoria: Categoria; tipo: string; subtipo: string;
  data_inicio: string; data_fim: string;
  entrada: string; saida_almoco: string; retorno_almoco: string; saida: string;
  justificativa: string;
  gozo_imediato: boolean; referencia_id: string; unidade_destino_id: string;
};
type Aprovada = { id: string; protocolo: string; categoria: Categoria; tipo: string; subtipo: string | null; data_inicio: string; data_fim: string };

const novoForm = (categoria: Categoria): Form => ({
  categoria, tipo: CATEGORIAS[categoria].tipos[0], subtipo: '',
  data_inicio: hojeISO(), data_fim: hojeISO(),
  entrada: '', saida_almoco: '', retorno_almoco: '', saida: '', justificativa: '',
  gozo_imediato: false, referencia_id: '', unidade_destino_id: '',
});

const ICONES = {
  ponto: Fingerprint, folga: CalendarClock, ferias: TreePalm, cancelamento: CalendarX, saida: DoorOpen, estagio: GraduationCap,
  transferencia: ArrowLeftRight,
} as const;

/** Texto de apoio da justificativa, conforme o tipo */
const DICA_JUSTIFICATIVA: Partial<Record<Categoria, string>> = {
  saida: 'Motivo da saída antecipada.',
  estagio: 'Instituição de ensino, curso, período e horários do estágio.',
  transferencia: 'Motivo do pedido de transferência.',
  cancelamento: 'Por que a folga ou as férias precisam ser canceladas.',
};

/** Confere os primeiros bytes: PDF (%PDF), PNG ou JPEG */
async function conteudoConfere(a: File) {
  const b = new Uint8Array(await a.slice(0, 8).arrayBuffer());
  const pdf = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return (a.type === 'application/pdf' && pdf) || (a.type === 'image/png' && png) || (a.type === 'image/jpeg' && jpg);
}

export default function NovaSolicitacao({ perfil, categoriaInicial = 'ponto' }: { perfil: Perfil; categoriaInicial?: Categoria }) {
  const usuarioId = perfil.id;
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState<Form>(() => novoForm(categoriaInicial));
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<{ protocolo: string; situacao: string } | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [aprovadas, setAprovadas] = useState<Aprovada[] | null>(null);
  const [destinos, setDestinos] = useState<{ id: string; nome: string }[]>([]);

  // Para cancelamento: folgas e férias suas já aprovadas. Para transferência: as unidades ativas.
  useEffect(() => {
    let vivo = true;
    if (f.categoria === 'cancelamento' && !aprovadas) {
      supabase.from('solicitacoes').select('id, protocolo, categoria, tipo, subtipo, data_inicio, data_fim')
        .eq('solicitante_id', usuarioId).eq('situacao', 'Aprovado').in('categoria', ['folga', 'ferias'])
        .order('data_inicio', { ascending: false }).limit(100)
        .then(({ data }) => vivo && setAprovadas((data as Aprovada[]) ?? []));
    }
    if (f.categoria === 'transferencia' && !destinos.length) {
      supabase.from('unidades').select('id, nome').eq('ativa', true).order('nome')
        .then(({ data }) => vivo && setDestinos(((data as { id: string; nome: string }[]) ?? []).filter((u) => u.id !== perfil.unidade_id)));
    }
    return () => { vivo = false; };
  }, [f.categoria, supabase, usuarioId, aprovadas, destinos.length, perfil.unidade_id]);

  const obrigatorio = anexoObrigatorio(f.categoria, f.tipo);
  const comHorarios = pedeHorarios(f.categoria, f.tipo);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  function escolherCategoria(c: Categoria) {
    setF((x) => ({ ...x, categoria: c, tipo: CATEGORIAS[c].tipos[0], subtipo: '', gozo_imediato: false, referencia_id: '', unidade_destino_id: '' }));
    setErro(null);
  }

  async function escolherArquivo(a: File | null) {
    setErro(null);
    if (!a) return setArquivo(null);
    if (!ANEXO_TIPOS.includes(a.type)) return setErro('Envie o comprovante em PDF, JPG ou PNG.');
    if (a.size > ANEXO_MAX_MB * 1024 * 1024) return setErro(`O arquivo passa de ${ANEXO_MAX_MB} MB. Envie uma foto ou PDF menor.`);
    // confere o conteúdo de verdade (um arquivo renomeado para .pdf não passa)
    if (!(await conteudoConfere(a))) return setErro('Este arquivo não parece ser um PDF ou uma imagem válida. Gere o arquivo de novo e tente outra vez.');
    setArquivo(a);
  }

  /** Etapas que este pedido vai percorrer (Circular 254/2026: conforme o seu cargo e o tipo do pedido) */
  const r = rota(perfil.papel, perfil.grupo_cargo ?? 'geral', f.categoria);
  const podeGozoImediato = f.categoria === 'folga' && r.fluxo === 'ambos' && r.vagas.length === 2;
  const etapas = [
    'Você envia',
    ...etapasUnidade(r.fluxo, r.vagas),
    ...(r.coordenacao ? [f.categoria === 'transferencia' ? 'Coordenação de Referência / Direção avalia' : 'Coordenação de Enfermagem avalia'] : []),
    ...(r.direcao ? ['Direção dá a decisão final'] : []),
    'Pronto: você acompanha em Minhas solicitações',
  ];
  const referencia = aprovadas?.find((a) => a.id === f.referencia_id);
  const umaData = umDia(f.categoria);
  const justificativaObrigatoria = f.tipo === 'Outros' || ['saida', 'estagio', 'transferencia'].includes(f.categoria);

  function validar(): string | null {
    if (f.categoria === 'cancelamento') {
      if (!f.referencia_id) return 'Escolha a folga ou as férias que deseja cancelar.';
    } else if (!f.data_inicio) return 'Informe a data.';
    if (f.categoria === 'transferencia' && !f.unidade_destino_id) return 'Escolha a unidade de destino.';
    if (f.categoria === 'saida' && !f.saida) return 'Informe o horário em que você vai sair.';
    if (justificativaObrigatoria && !f.justificativa.trim()) {
      return f.categoria === 'estagio' ? 'Informe a instituição, o curso e os horários do estágio.' : 'Explique o motivo na justificativa.';
    }
    if (f.data_fim && f.data_fim < f.data_inicio) return 'A data final não pode ser antes da inicial.';
    if (f.tipo === 'Atestado' && !f.subtipo) return 'Escolha o tipo de atestado.';
    if (comHorarios && ![f.entrada, f.saida_almoco, f.retorno_almoco, f.saida].some(Boolean)) {
      return 'Informe pelo menos um horário que precisa ser ajustado.';
    }
    if (obrigatorio && !arquivo) return 'Este tipo de pedido precisa do comprovante anexado.';
    return null;
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const msg = validar();
    if (msg) return setErro(msg);
    setErro(null);
    setEnviando(true);

    let caminho: string | null = null;
    if (arquivo) {
      caminho = `${usuarioId}/${crypto.randomUUID()}-${nomeArquivoSeguro(arquivo.name)}`;
      const { error } = await supabase.storage.from('comprovantes').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (error) {
        setEnviando(false);
        return setErro(`Não foi possível enviar o comprovante: ${error.message}`);
      }
    }

    const { data, error } = await supabase.from('solicitacoes').insert({
      categoria: f.categoria,
      tipo: f.categoria === 'cancelamento' && referencia
        ? (referencia.categoria === 'folga' ? 'Cancelamento de folga' : 'Cancelamento de férias') : f.tipo,
      subtipo: f.tipo === 'Atestado' ? f.subtipo : null,
      data_inicio: referencia?.data_inicio ?? f.data_inicio,
      data_fim: referencia?.data_fim ?? (umaData ? f.data_inicio : f.data_fim || f.data_inicio),
      entrada: comHorarios ? f.entrada || null : null,
      saida_almoco: comHorarios ? f.saida_almoco || null : null,
      retorno_almoco: comHorarios ? f.retorno_almoco || null : null,
      saida: comHorarios || f.categoria === 'saida' ? f.saida || null : null,
      justificativa: f.justificativa.trim() || null,
      anexo_path: caminho,
      anexo_nome: arquivo ? arquivo.name.slice(0, 200) : null,
      gozo_imediato: podeGozoImediato && f.gozo_imediato,
      referencia_id: f.categoria === 'cancelamento' ? f.referencia_id : null,
      unidade_destino_id: f.categoria === 'transferencia' ? f.unidade_destino_id : null,
      // o banco completa quem pediu, unidade, protocolo, caminho das assinaturas e situação
    }).select('protocolo, situacao').single();

    if (error || !data) {
      if (caminho) await supabase.storage.from('comprovantes').remove([caminho]);
      setEnviando(false);
      return setErro(mensagemErro(error));
    }
    limparCacheTelas();
    setEnviando(false);
    setFeito(data);
  }

  if (feito) {
    return (
      <div className="w-full">
        <div className="dock-card p-6 sm:p-8">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-forest-light text-forest"><CheckCircle2 className="size-6" aria-hidden /></span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Solicitação enviada</h1>
          <p className="mt-1 text-tinta-suave">
            Protocolo <span className="font-mono font-semibold text-tinta">{feito.protocolo}</span>. Agora ela está
            {feito.situacao === 'Aguardando chefia' ? ' aguardando a assinatura da chefia da sua unidade.'
              : feito.situacao === 'Aguardando coordenação' ? (f.categoria === 'transferencia' ? ' com a Coordenação / Direção.' : ' com a Coordenação de Enfermagem.')
              : ' com a Direção.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/minhas" className="dock-btn-primary">
              Acompanhar em Minhas solicitações
            </Link>
            <Botao variante="secundario" onClick={() => { setF(novoForm(f.categoria)); setArquivo(null); setFeito(null); }}>Fazer outra</Botao>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="w-full space-y-6">
      <Cabecalho icone={PlusCircle} titulo="Nova solicitação" descricao="Ocorrências de ponto, folgas, férias, cancelamentos, saída antecipada, estágio e transferência. Você acompanha tudo em Minhas solicitações." />

      <fieldset>
        <legend className="text-xs font-semibold text-tinta-suave">O que você precisa?</legend>
        <div role="radiogroup" className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => {
            const Icone = ICONES[c];
            const ativo = f.categoria === c;
            return (
              <button key={c} type="button" role="radio" aria-checked={ativo} onClick={() => escolherCategoria(c)}
                className={`flex min-h-[44px] gap-3 rounded-2xl border bg-white p-4 text-left shadow-xs transition-all ${
                  ativo ? 'border-electric-cobalt ring-2 ring-electric-cobalt/20' : 'border-linha hover:border-steel-gray'}`}>
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${ativo ? 'bg-electric-cobalt text-white' : 'bg-lavender-mist text-electric-cobalt'}`}>
                  <Icone className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{CATEGORIAS[c].titulo}</span>
                  <span className="block text-sm text-tinta-suave">{CATEGORIAS[c].descricao}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="dock-card space-y-5 p-5 sm:p-6">
          {CATEGORIAS[f.categoria].tipos.length > 1 && f.categoria !== 'cancelamento' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo={f.categoria === 'folga' ? 'Folga referente a *' : 'Tipo de ocorrência *'}>
                <select value={f.tipo} onChange={(e) => { set('tipo', e.target.value); set('subtipo', ''); }} className={inputCls}>
                  {CATEGORIAS[f.categoria].tipos.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Campo>
              {f.tipo === 'Atestado' && (
                <Campo rotulo="Tipo de atestado *">
                  <select value={f.subtipo} onChange={(e) => set('subtipo', e.target.value)} className={inputCls}>
                    <option value="">Selecione</option>
                    {SUBTIPOS_ATESTADO.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Campo>
              )}
            </div>
          )}

          {f.categoria === 'cancelamento' ? (
            <Campo rotulo="Folga ou férias a cancelar *" dica="Só aparecem pedidos seus já aprovados. Se ainda estiver em análise, cancele em Minhas solicitações.">
              <select value={f.referencia_id} onChange={(e) => set('referencia_id', e.target.value)} className={inputCls}>
                <option value="">{aprovadas === null ? 'Carregando…' : aprovadas.length ? 'Selecione' : 'Nenhuma folga ou férias aprovada'}</option>
                {(aprovadas ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.protocolo} | {CATEGORIAS[a.categoria].titulo}: {rotuloTipo(a)} | {periodo(a)}
                  </option>
                ))}
              </select>
            </Campo>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {f.categoria === 'transferencia' && (
                <Campo rotulo="Unidade de destino *">
                  <select value={f.unidade_destino_id} onChange={(e) => set('unidade_destino_id', e.target.value)} className={inputCls}>
                    <option value="">Selecione</option>
                    {destinos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </Campo>
              )}
              <Campo rotulo={f.categoria === 'transferencia' ? 'A partir de *' : umaData ? 'Data *' : 'Data inicial *'}>
                <input type="date" value={f.data_inicio} required className={inputCls}
                  onChange={(e) => setF((x) => ({ ...x, data_inicio: e.target.value, data_fim: !x.data_fim || x.data_fim < e.target.value ? e.target.value : x.data_fim }))} />
              </Campo>
              {f.categoria === 'saida' && (
                <Campo rotulo="Horário da saída *">
                  <input type="time" value={f.saida} onChange={(e) => set('saida', e.target.value)} className={inputCls} />
                </Campo>
              )}
              {!umaData && (
                <Campo rotulo="Data final" dica={f.data_inicio && f.data_fim && f.data_fim > f.data_inicio ? periodo({ data_inicio: f.data_inicio, data_fim: f.data_fim }) : undefined}>
                  <input type="date" value={f.data_fim} min={f.data_inicio} onChange={(e) => set('data_fim', e.target.value)} className={inputCls} />
                </Campo>
              )}
            </div>
          )}
          {referencia && (
            <p className="rounded-xl border border-linha bg-faint-gray px-4 py-2.5 text-sm text-slate-gray">
              Ao ser aprovado, o protocolo {referencia.protocolo} ({dataBR(referencia.data_inicio)}) passa a constar como cancelado.
            </p>
          )}

          {comHorarios && (
            <fieldset>
              <legend className="text-xs font-semibold text-tinta-suave">Horários para ajuste * <span className="font-normal">(preencha só os que faltaram ou estão errados)</span></legend>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([['entrada', 'Entrada'], ['saida_almoco', 'Saída almoço'], ['retorno_almoco', 'Retorno almoço'], ['saida', 'Saída']] as const).map(([k, rot]) => (
                  <Campo key={k} rotulo={rot}>
                    <input type="time" value={f[k]} onChange={(e) => set(k, e.target.value)} className={inputCls} />
                  </Campo>
                ))}
              </div>
            </fieldset>
          )}

          {podeGozoImediato && (
            <label className="flex items-start gap-2 rounded-xl border border-linha bg-faint-gray px-4 py-3 text-sm">
              <input type="checkbox" checked={f.gozo_imediato} onChange={(e) => set('gozo_imediato', e.target.checked)} className="mt-0.5 size-4 accent-electric-cobalt" />
              <span>
                <strong>Folga para gozo imediato.</strong> Se o Enfermeiro ou o Gerente estiver ausente, o outro pode assinar sozinho,
                com consenso prévio entre os dois e registrando que a outra chefia está ciente.
              </span>
            </label>
          )}

          <Campo rotulo={justificativaObrigatoria ? 'Justificativa *' : 'Justificativa / observações'}>
            <textarea rows={3} value={f.justificativa} onChange={(e) => set('justificativa', e.target.value)} className={inputCls}
              placeholder={DICA_JUSTIFICATIVA[f.categoria] ?? 'Conte o que aconteceu, se ajudar a chefia a analisar.'} />
          </Campo>

          <div>
            <span className="mb-1 block text-xs font-semibold text-tinta-suave">
              Comprovante {obrigatorio ? '* (obrigatório para este tipo)' : '(opcional)'}
            </span>
            {arquivo ? (
              <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-linha bg-faint-gray px-4 py-2 text-sm">
                <span className="min-w-0 truncate"><FileUp className="mr-2 inline size-4 text-tinta-suave" aria-hidden />{arquivo.name}</span>
                <button type="button" onClick={() => { setArquivo(null); if (inputArquivo.current) inputArquivo.current.value = ''; }}
                  className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-slate-gray hover:text-danger">
                  <Trash2 className="size-4" aria-hidden /> Remover
                </button>
              </div>
            ) : (
              <label className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-7 text-center text-sm transition-colors hover:bg-faint-gray ${
                obrigatorio ? 'border-electric-cobalt/40 bg-lavender-mist/40' : 'border-linha'}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); escolherArquivo(e.dataTransfer.files?.[0] ?? null); }}>
                <FileUp className="size-6 text-tinta-suave" aria-hidden />
                <span className="font-semibold">Escolher arquivo</span>
                <span className="text-xs text-tinta-suave">PDF, JPG ou PNG, até {ANEXO_MAX_MB} MB. Pode tirar foto pelo celular.</span>
                <input ref={inputArquivo} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  className="sr-only" onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>

          {erro && <Aviso>{erro}</Aviso>}

          <div className="flex justify-end">
            <Botao type="submit" carregando={enviando} className="w-full sm:w-auto">Enviar solicitação</Botao>
          </div>
        </div>

        <aside className="dock-card h-fit p-5 sm:p-6">
          <h2 className="text-sm font-bold">Como este pedido vai andar</h2>
          <ol className="mt-3 space-y-3">
            {etapas.map((t, i) => (
              <li key={t} className="flex gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-lavender-mist text-xs font-bold text-electric-cobalt">{i + 1}</span>
                <span className="pt-0.5">{t}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-tinta-suave">
            {r.fluxo === 'direcao' ? 'Seu pedido vai direto à Direção: ninguém assina o próprio pedido.'
              : r.fluxo === 'um' ? 'Farmácia: basta uma chefia (Circular 254/2026). Avise antes o Enfermeiro ou o Gerente sobre a ausência.'
              : r.fluxo === 'ambos' && r.vagas.length === 2 ? 'Na ausência do Enfermeiro ou do Gerente (férias ou afastamento médico), o Supervisor assina no lugar.'
              : r.fluxo === 'saida_estagio' ? 'Com Enfermeiro e Gerente ausentes, o pedido aguarda o retorno das chefias.'
              : r.vagas[0] === 'gerente' ? 'Na ausência do Gerente, o Supervisor assina no lugar.' : 'Conforme a Circular nº 254/2026.'}
          </p>
        </aside>
      </div>
    </form>
  );
}
