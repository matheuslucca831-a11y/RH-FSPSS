'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CalendarClock, CheckCircle2, FileUp, Fingerprint, PlusCircle, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hojeISO, mensagemErro } from '@/lib/formato';
import { limparCacheTelas } from '@/lib/cacheTela';
import {
  ANEXO_MAX_MB, ANEXO_TIPOS, CATEGORIAS, SUBTIPOS_ATESTADO, anexoObrigatorio, nomeArquivoSeguro, pedeHorarios, periodo,
  type Categoria,
} from '@/lib/solicitacoes';
import type { Papel } from '@/lib/types';
import { Aviso, Botao, Cabecalho, Campo, inputCls } from '@/components/ui';

type Form = {
  categoria: Categoria; tipo: string; subtipo: string;
  data_inicio: string; data_fim: string;
  entrada: string; saida_almoco: string; retorno_almoco: string; saida: string;
  justificativa: string;
};

const novoForm = (categoria: Categoria): Form => ({
  categoria, tipo: CATEGORIAS[categoria].tipos[0], subtipo: '',
  data_inicio: hojeISO(), data_fim: hojeISO(),
  entrada: '', saida_almoco: '', retorno_almoco: '', saida: '', justificativa: '',
});

const ICONES = { ponto: Fingerprint, folga: CalendarClock } as const;

/** Confere os primeiros bytes: PDF (%PDF), PNG ou JPEG */
async function conteudoConfere(a: File) {
  const b = new Uint8Array(await a.slice(0, 8).arrayBuffer());
  const pdf = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return (a.type === 'application/pdf' && pdf) || (a.type === 'image/png' && png) || (a.type === 'image/jpeg' && jpg);
}

export default function NovaSolicitacao({ usuarioId, papel, categoriaInicial = 'ponto' }: { usuarioId: string; papel: Papel; categoriaInicial?: Categoria }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState<Form>(() => novoForm(categoriaInicial));
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<{ protocolo: string; situacao: string } | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const obrigatorio = anexoObrigatorio(f.categoria, f.tipo);
  const comHorarios = pedeHorarios(f.categoria, f.tipo);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  function escolherCategoria(c: Categoria) {
    setF((x) => ({ ...x, categoria: c, tipo: CATEGORIAS[c].tipos[0], subtipo: '' }));
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

  /** Etapas que este pedido vai percorrer (conforme quem pede e o tipo) */
  const etapas = [
    'Você envia',
    ...(papel === 'funcionario' ? ['Chefia da unidade analisa'] : []),
    ...(f.categoria === 'folga' || papel !== 'funcionario' ? ['Direção decide'] : []),
    'Pronto: você acompanha em Minhas solicitações',
  ];

  function validar(): string | null {
    if (!f.data_inicio) return 'Informe a data.';
    if (f.data_fim && f.data_fim < f.data_inicio) return 'A data final não pode ser antes da inicial.';
    if (f.tipo === 'Atestado' && !f.subtipo) return 'Escolha o tipo de atestado.';
    if (comHorarios && ![f.entrada, f.saida_almoco, f.retorno_almoco, f.saida].some(Boolean)) {
      return 'Informe pelo menos um horário que precisa ser ajustado.';
    }
    if (f.tipo === 'Outros' && !f.justificativa.trim()) return 'Explique o motivo na justificativa.';
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
      tipo: f.tipo,
      subtipo: f.tipo === 'Atestado' ? f.subtipo : null,
      data_inicio: f.data_inicio,
      data_fim: f.data_fim || f.data_inicio,
      entrada: comHorarios ? f.entrada || null : null,
      saida_almoco: comHorarios ? f.saida_almoco || null : null,
      retorno_almoco: comHorarios ? f.retorno_almoco || null : null,
      saida: comHorarios ? f.saida || null : null,
      justificativa: f.justificativa.trim() || null,
      anexo_path: caminho,
      anexo_nome: arquivo ? arquivo.name.slice(0, 200) : null,
      // o banco completa quem pediu, unidade, protocolo e situação
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
            {feito.situacao === 'Aguardando chefia' ? ' com a chefia da sua unidade.' : ' com a Direção.'}
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
      <Cabecalho icone={PlusCircle} titulo="Nova solicitação" descricao="Peça um ajuste de ponto ou uma folga. Você acompanha tudo em Minhas solicitações." />

      <fieldset>
        <legend className="text-xs font-semibold text-tinta-suave">O que você precisa?</legend>
        <div role="radiogroup" className="mt-2 grid gap-3 sm:grid-cols-2">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Data inicial *">
              <input type="date" value={f.data_inicio} required className={inputCls}
                onChange={(e) => setF((x) => ({ ...x, data_inicio: e.target.value, data_fim: !x.data_fim || x.data_fim < e.target.value ? e.target.value : x.data_fim }))} />
            </Campo>
            <Campo rotulo="Data final" dica={f.data_inicio && f.data_fim && f.data_fim > f.data_inicio ? periodo({ data_inicio: f.data_inicio, data_fim: f.data_fim }) : undefined}>
              <input type="date" value={f.data_fim} min={f.data_inicio} onChange={(e) => set('data_fim', e.target.value)} className={inputCls} />
            </Campo>
          </div>

          {comHorarios ? (
            <fieldset>
              <legend className="text-xs font-semibold text-tinta-suave">Horários para ajuste * <span className="font-normal">(preencha só os que faltaram ou estão errados)</span></legend>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([['entrada', 'Entrada'], ['saida_almoco', 'Saída almoço'], ['retorno_almoco', 'Retorno almoço'], ['saida', 'Saída']] as const).map(([k, r]) => (
                  <Campo key={k} rotulo={r}>
                    <input type="time" value={f[k]} onChange={(e) => set(k, e.target.value)} className={inputCls} />
                  </Campo>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="rounded-xl border border-linha bg-faint-gray px-4 py-2.5 text-sm text-slate-gray">Período integral: não é preciso informar horários.</p>
          )}

          <Campo rotulo={f.tipo === 'Outros' ? 'Justificativa *' : 'Justificativa / observações'}>
            <textarea rows={3} value={f.justificativa} onChange={(e) => set('justificativa', e.target.value)} className={inputCls}
              placeholder="Conte o que aconteceu, se ajudar a chefia a analisar." />
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
          {papel !== 'funcionario' && (
            <p className="mt-4 text-xs text-tinta-suave">Seu pedido não passa pela chefia: ninguém analisa o próprio pedido.</p>
          )}
        </aside>
      </div>
    </form>
  );
}
