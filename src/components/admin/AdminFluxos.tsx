'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, GitBranch, Pencil, Plus, Power, RefreshCw, Trash2, UserPlus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemErro, normalizar } from '@/lib/formato';
import {
  CARGOS_UNIDADE, CATEGORIAS, PAPEIS_ASSINANTES, TIPOS_VAGA, quemAssina,
  type Categoria, type Etapa, type Fluxo, type Rotas, type TipoVaga, type VagaFluxo,
} from '@/lib/solicitacoes';
import Escolha, { type Opcao } from '@/components/Escolha';
import { Aviso, Botao, Campo, CampoBusca, inputCls } from '@/components/ui';
import DiagramaCaminho from './DiagramaCaminho';

type Pessoa = { id: string; nome: string; matricula: string; cargo: string | null; fluxo_id: string | null; ativo: boolean };

const MAX_ETAPAS = 6;
const MAX_VAGAS = 8;
const CATS = Object.keys(CATEGORIAS) as Categoria[];

const vagaNova = (): VagaFluxo => ({ tipo: 'papel', valor: 'direcao' });
const etapaNova = (n: number): Etapa => ({ nome: n === 0 ? 'Direção' : `Etapa ${n + 1}`, regra: 'um', vagas: [vagaNova()], substituto: null, gozo_imediato: false });
const FLUXO_NOVO: Omit<Fluxo, 'id'> = { nome: '', descricao: '', ativo: true, rotas: { padrao: [etapaNova(0)] } };

/** O banco guarda as vagas sem o rótulo (o rótulo é posto no pedido, no envio) */
function limparRotas(r: Rotas): Rotas {
  const limpa = (c: Etapa[]) => c.map((e) => ({
    nome: e.nome.trim(), regra: e.regra,
    vagas: e.vagas.map(({ tipo, valor }) => ({ tipo, valor: valor.trim() })),
    substituto: e.substituto ? { tipo: e.substituto.tipo, valor: e.substituto.valor.trim() } : null,
    gozo_imediato: e.regra === 'todos' && e.vagas.length === 2 && e.gozo_imediato,
  }));
  const out: Rotas = { padrao: limpa(r.padrao) };
  for (const c of CATS) if (r[c]) out[c] = limpa(r[c]!);
  return out;
}

/** Fluxos de assinatura: a Direção monta quem assina, em que ordem, por tipo de pedido */
export default function AdminFluxos() {
  const supabase = useMemo(() => createClient(), []);
  const [fluxos, setFluxos] = useState<Fluxo[] | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [editando, setEditando] = useState<(Omit<Fluxo, 'id'> & { id?: string }) | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.from('fluxos').select('id, nome, descricao, rotas, ativo, atualizado_em').order('nome'),
      supabase.from('perfis').select('id, nome, matricula, cargo, fluxo_id, ativo').order('nome'),
    ]).then(([f, p]) => {
      if (!vivo) return;
      setFluxos((f.data as Fluxo[]) ?? []);
      setPessoas((p.data as Pessoa[]) ?? []);
      setErro(f.error ? mensagemErro(f.error) : null);
    });
    return () => { vivo = false; };
  }, [supabase, versao]);

  const nomes = useMemo(() => Object.fromEntries(pessoas.map((p) => [p.id, p.nome])), [pessoas]);
  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of pessoas) if (p.fluxo_id && p.ativo) c[p.fluxo_id] = (c[p.fluxo_id] ?? 0) + 1;
    return c;
  }, [pessoas]);
  const visiveis = (fluxos ?? []).filter((f) => !busca || normalizar(`${f.nome} ${f.descricao ?? ''}`).includes(normalizar(busca)));

  function concluir(msg: string) {
    setOk(msg);
    setErro(null);
    setVersao((v) => v + 1);
  }

  async function salvar() {
    if (!editando) return;
    if (editando.nome.trim().length < 2) return setErro('Dê um nome ao fluxo (ex.: "Vigilância | Cargos gerais").');
    const vazia = [editando.rotas.padrao, ...CATS.map((c) => editando.rotas[c] ?? [])].flat()
      .some((e) => !e.nome.trim() || e.vagas.some((v) => !v.valor.trim()) || (e.substituto && !e.substituto.valor.trim()));
    if (vazia) return setErro('Preencha o nome de cada etapa e escolha todos os assinantes.');
    setOcupado('salvar');
    const dados = { nome: editando.nome.trim(), descricao: editando.descricao?.trim() || null, ativo: editando.ativo, rotas: limparRotas(editando.rotas) };
    const { error } = editando.id
      ? await supabase.from('fluxos').update(dados).eq('id', editando.id)
      : await supabase.from('fluxos').insert(dados);
    setOcupado(null);
    if (error) return setErro(error.code === '23505' ? 'Já existe um fluxo com esse nome.' : mensagemErro(error));
    setEditando(null);
    concluir(editando.id
      ? `Fluxo "${dados.nome}" salvo. Os pedidos que ainda aguardam assinatura passam a seguir o fluxo novo (as assinaturas já feitas continuam valendo).`
      : `Fluxo "${dados.nome}" criado. Agora aplique a quem ele vale em Usuários (dá para marcar vários de uma vez).`);
  }

  async function alternarAtivo(f: Fluxo) {
    if (f.ativo && contagem[f.id] && !window.confirm(`Desativar "${f.nome}"? As ${contagem[f.id]} pessoas que usam este fluxo passam a ter os pedidos decididos só pela Direção até receberem outro fluxo.`)) return;
    setOcupado(f.id);
    const { error } = await supabase.from('fluxos').update({ ativo: !f.ativo }).eq('id', f.id);
    setOcupado(null);
    if (error) return setErro(mensagemErro(error));
    concluir(f.ativo ? `Fluxo "${f.nome}" desativado.` : `Fluxo "${f.nome}" reativado.`);
  }

  async function excluir(f: Fluxo) {
    const n = contagem[f.id] ?? 0;
    if (!window.confirm(n
      ? `Excluir "${f.nome}"? ${n} ${n === 1 ? 'pessoa usa' : 'pessoas usam'} este fluxo e ficarão sem fluxo (só a Direção decide) até receberem outro.`
      : `Excluir o fluxo "${f.nome}"?`)) return;
    setOcupado(f.id);
    const { error } = await supabase.from('fluxos').delete().eq('id', f.id);
    setOcupado(null);
    if (error) return setErro(mensagemErro(error));
    concluir(`Fluxo "${f.nome}" excluído.`);
  }

  return (
    <div className="space-y-5">
      <div className="dock-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-electric-cobalt text-white shadow-xs"><GitBranch className="size-6" aria-hidden /></div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink-charcoal">Fluxos de assinatura</h2>
            <p className="mt-0.5 text-xs text-slate-gray">
              Monte quem assina os pedidos, em que ordem e com quais substitutos. Cada diretoria pode ter os seus. Depois aplique o fluxo às pessoas em Usuários.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => setVersao((v) => v + 1)} className="dock-btn-ghost !px-4 text-xs font-semibold">
            <RefreshCw className="size-3.5" aria-hidden /> Atualizar
          </button>
          <button type="button" onClick={() => { setEditando(structuredClone(FLUXO_NOVO)); setOk(null); setErro(null); }} className="dock-btn-primary text-xs font-semibold">
            <Plus className="size-4" aria-hidden /> Novo fluxo
          </button>
        </div>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tom="info">{ok}</Aviso>}

      {editando ? (
        <Editor valor={editando} onChange={setEditando} pessoas={pessoas} nomes={nomes}
          salvando={ocupado === 'salvar'} onSalvar={salvar} onCancelar={() => { setEditando(null); setErro(null); }} />
      ) : !fluxos ? (
        <div className="dock-card p-12 text-center text-xs text-slate-gray">
          <RefreshCw className="mx-auto mb-2 size-5 animate-spin text-electric-cobalt" aria-hidden /> Carregando fluxos
        </div>
      ) : (
        <>
          {fluxos.length > 4 && <CampoBusca valor={busca} onChange={setBusca} placeholder="Buscar fluxo" className="sm:w-72" />}
          <div className="grid gap-3 xl:grid-cols-2">
            {visiveis.map((f) => {
              const proprios = CATS.filter((c) => f.rotas[c]);
              return (
                <div key={f.id} className={`dock-card flex flex-col gap-3 p-4 sm:p-5 ${f.ativo ? '' : 'opacity-70'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-ink-charcoal">{f.nome}</h3>
                      {f.descricao && <p className="mt-0.5 text-xs text-slate-gray">{f.descricao}</p>}
                    </div>
                    <span className="shrink-0 rounded-full border border-electric-cobalt/20 bg-powder-blue/25 px-3 py-0.5 text-[11px] font-semibold text-electric-cobalt">
                      {contagem[f.id] ?? 0} {(contagem[f.id] ?? 0) === 1 ? 'pessoa' : 'pessoas'}{f.ativo ? '' : ' | desativado'}
                    </span>
                  </div>
                  {agruparCaminhos(f.rotas, proprios).map((g) => (
                    <ResumoCaminho key={g.titulo} titulo={g.titulo} etapas={g.etapas} nomes={nomes} />
                  ))}
                  <div className="flex flex-wrap gap-1.5 border-t border-linha pt-3">
                    <AcaoFluxo icone={Pencil} rotulo="Editar" onClick={() => { setEditando(structuredClone(f)); setOk(null); setErro(null); }} />
                    <AcaoFluxo icone={Copy} rotulo="Duplicar" onClick={() => {
                      const { id: _id, ...resto } = structuredClone(f);
                      setEditando({ ...resto, nome: `${f.nome} (cópia)` }); setOk(null); setErro(null);
                    }} />
                    <AcaoFluxo icone={Power} rotulo={f.ativo ? 'Desativar' : 'Reativar'} onClick={() => alternarAtivo(f)} carregando={ocupado === f.id} />
                    <AcaoFluxo icone={Trash2} rotulo="Excluir" perigo onClick={() => excluir(f)} />
                  </div>
                </div>
              );
            })}
          </div>
          {visiveis.length === 0 && <div className="dock-card p-10 text-center text-sm text-slate-gray">Nenhum fluxo encontrado.</div>}
          <p className="text-xs text-slate-gray">
            Quem está sem fluxo tem os pedidos decididos só pela Direção. Ninguém assina o próprio pedido: se a pessoa ocupa a vaga, o pedido espera outra pessoa daquela vaga (ou a Direção decide direto).
          </p>
        </>
      )}
    </div>
  );
}

/** Junta os tipos de pedido que têm o mesmo caminho (ex.: "Folga, Férias e Cancelamento") */
function agruparCaminhos(rotas: Rotas, proprios: Categoria[]) {
  const chave = (e: Etapa[]) => JSON.stringify(limparRotas({ padrao: e }).padrao);
  const grupos = new Map<string, { nomes: string[]; etapas: Etapa[] }>();
  grupos.set(chave(rotas.padrao), { nomes: ['Demais pedidos'], etapas: rotas.padrao });
  for (const c of proprios) {
    const k = chave(rotas[c]!);
    const g = grupos.get(k);
    if (g) g.nomes.push(CATEGORIAS[c].titulo);
    else grupos.set(k, { nomes: [CATEGORIAS[c].titulo], etapas: rotas[c]! });
  }
  const lista = (n: string[]) => (n.length > 1 ? `${n.slice(0, -1).join(', ')} e ${n.at(-1)}` : n[0]);
  return [...grupos.values()].map((g) => {
    // "Demais pedidos" vai para o fim do nome do grupo e some se for o único caminho
    const nomes = [...g.nomes.filter((n) => n !== 'Demais pedidos'), ...g.nomes.filter((n) => n === 'Demais pedidos')];
    return { titulo: proprios.length === 0 ? 'Todos os pedidos' : lista(nomes), etapas: g.etapas };
  });
}

function ResumoCaminho({ titulo, etapas, nomes }: { titulo: string; etapas: Etapa[]; nomes: Record<string, string> }) {
  return (
    <div className="text-xs">
      <p className="mb-1.5 font-semibold text-slate-gray">{titulo}</p>
      <DiagramaCaminho etapas={etapas} nomes={nomes} compacto />
    </div>
  );
}

function AcaoFluxo({ icone: Icone, rotulo, onClick, perigo = false, carregando = false }: {
  icone: typeof Pencil; rotulo: string; onClick: () => void; perigo?: boolean; carregando?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={carregando}
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-linha bg-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-colors disabled:opacity-60 ${
        perigo ? 'text-danger hover:bg-danger-light' : 'text-mid-graphite hover:bg-faint-gray hover:text-ink-charcoal'}`}>
      <Icone className="size-3.5" aria-hidden /> {rotulo}
    </button>
  );
}

type Editando = Omit<Fluxo, 'id'> & { id?: string };

function Editor({ valor, onChange, pessoas, nomes, salvando, onSalvar, onCancelar }: {
  valor: Editando; onChange: (v: Editando) => void; pessoas: Pessoa[]; nomes: Record<string, string>;
  salvando: boolean; onSalvar: () => void; onCancelar: () => void;
}) {
  const [aba, setAba] = useState<'padrao' | Categoria>('padrao');
  const cargos = useMemo(() => [...new Set(pessoas.map((p) => p.cargo?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [pessoas]);
  const caminho = aba === 'padrao' ? valor.rotas.padrao : valor.rotas[aba];

  const setCaminho = (c: Etapa[] | undefined) => {
    const rotas = { ...valor.rotas };
    if (aba === 'padrao') rotas.padrao = c!;
    else if (c) rotas[aba] = c;
    else delete rotas[aba];
    onChange({ ...valor, rotas });
  };
  const setEtapa = (i: number, e: Etapa) => caminho && setCaminho(caminho.map((x, n) => (n === i ? e : x)));
  const mover = (i: number, d: -1 | 1) => {
    if (!caminho) return;
    const c = [...caminho];
    [c[i], c[i + d]] = [c[i + d], c[i]];
    setCaminho(c);
  };

  return (
    <div className="dock-card border-2 !border-electric-cobalt/30 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome do fluxo *" dica="Ex.: Vigilância | Cargos gerais">
          <input value={valor.nome} maxLength={80} onChange={(e) => onChange({ ...valor, nome: e.target.value })} className={inputCls} />
        </Campo>
        <Campo rotulo="Descrição (opcional)">
          <input value={valor.descricao ?? ''} maxLength={300} onChange={(e) => onChange({ ...valor, descricao: e.target.value })} className={inputCls}
            placeholder="Para quem é e de onde vem a regra" />
        </Campo>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold text-slate-gray">Caminho por tipo de pedido</p>
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist">
          {(['padrao', ...CATS] as const).map((c) => {
            const proprio = c === 'padrao' || !!valor.rotas[c];
            return (
              <button key={c} type="button" role="tab" aria-selected={aba === c} onClick={() => setAba(c)}
                className={`min-h-[36px] shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  aba === c ? 'bg-electric-cobalt text-white shadow-xs' : 'border border-linha bg-white text-slate-gray hover:text-ink-charcoal'}`}>
                {c === 'padrao' ? 'Padrão' : CATEGORIAS[c].titulo}
                {c !== 'padrao' && <span className="ml-1 opacity-80">{proprio ? '(próprio)' : '(= padrão)'}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desenho do caminho: atualiza enquanto a pessoa edita */}
      <section className="mt-4 rounded-2xl border border-electric-cobalt/15 bg-lavender-mist/40 p-4 sm:p-5" aria-label="Como fica o caminho">
        <p className="mb-3 text-sm font-bold text-ink-charcoal">
          Como fica: {aba === 'padrao' ? 'pedidos em geral' : CATEGORIAS[aba].titulo.toLowerCase()}
          {aba !== 'padrao' && !caminho && <span className="font-normal text-slate-gray"> (igual ao padrão)</span>}
        </p>
        <DiagramaCaminho etapas={caminho ?? valor.rotas.padrao} nomes={nomes} />
      </section>

      <p className="mt-5 text-xs font-semibold text-slate-gray">{caminho ? 'Editar as etapas' : ''}</p>
      <div className="mt-2 space-y-3">
        {aba !== 'padrao' && !caminho ? (
          <div className="rounded-2xl border border-dashed border-linha bg-faint-gray/40 p-5 text-sm text-slate-gray">
            <p><strong className="text-ink-charcoal">{CATEGORIAS[aba].titulo}</strong> segue o mesmo caminho dos pedidos em geral (desenho acima).</p>
            <Botao variante="secundario" className="mt-3" onClick={() => setCaminho(structuredClone(valor.rotas.padrao))}>
              <Plus className="size-4" aria-hidden /> Criar um caminho próprio para {CATEGORIAS[aba].titulo.toLowerCase()}
            </Botao>
          </div>
        ) : caminho && (
          <>
            {caminho.map((e, i) => (
              <EditorEtapa key={`${aba}-${i}`} n={i} total={caminho.length} etapa={e} onChange={(x) => setEtapa(i, x)}
                pessoas={pessoas} cargos={cargos} nomes={nomes}
                onSubir={i > 0 ? () => mover(i, -1) : undefined}
                onDescer={i < caminho.length - 1 ? () => mover(i, 1) : undefined}
                onRemover={caminho.length > 1 ? () => setCaminho(caminho.filter((_, n) => n !== i)) : undefined} />
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {caminho.length < MAX_ETAPAS ? (
                <Botao variante="secundario" onClick={() => setCaminho([...caminho, etapaNova(caminho.length)])}>
                  <Plus className="size-4" aria-hidden /> Adicionar etapa
                </Botao>
              ) : <span className="text-xs text-slate-gray">Máximo de {MAX_ETAPAS} etapas.</span>}
              {aba !== 'padrao' && (
                <Botao variante="discreto" onClick={() => setCaminho(undefined)}>Voltar a usar o caminho padrão</Botao>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-linha pt-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={valor.ativo} onChange={(e) => onChange({ ...valor, ativo: e.target.checked })} className="size-4 accent-electric-cobalt" />
          Fluxo ativo
        </label>
        <div className="flex justify-end gap-2">
          <Botao variante="discreto" onClick={onCancelar}>Cancelar</Botao>
          <Botao carregando={salvando} onClick={onSalvar}>Salvar fluxo</Botao>
        </div>
      </div>
    </div>
  );
}

function EditorEtapa({ n, total, etapa, onChange, pessoas, cargos, nomes, onSubir, onDescer, onRemover }: {
  n: number; total: number; etapa: Etapa; onChange: (e: Etapa) => void; pessoas: Pessoa[]; cargos: string[]; nomes: Record<string, string>;
  onSubir?: () => void; onDescer?: () => void; onRemover?: () => void;
}) {
  const set = (p: Partial<Etapa>) => onChange({ ...etapa, ...p });
  const podeGozo = etapa.regra === 'todos' && etapa.vagas.length === 2;
  return (
    <div className="rounded-2xl border border-linha bg-white p-3.5 shadow-xs sm:p-4">
      <div className="flex items-start gap-2">
        <span className="mt-2.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-electric-cobalt text-xs font-bold text-white">{n + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Campo rotulo="Nome da etapa *" className="flex-1">
              <input value={etapa.nome} maxLength={60} onChange={(e) => set({ nome: e.target.value })} className={inputCls} placeholder="Ex.: Chefia da unidade" />
            </Campo>
            <div className="flex shrink-0 gap-1">
              <IconeBotao rotulo="Subir etapa" onClick={onSubir}><ArrowUp className="size-4" /></IconeBotao>
              <IconeBotao rotulo="Descer etapa" onClick={onDescer}><ArrowDown className="size-4" /></IconeBotao>
              <IconeBotao rotulo="Remover etapa" onClick={onRemover} perigo><Trash2 className="size-4" /></IconeBotao>
            </div>
          </div>

          <p className="mt-3 text-xs font-semibold text-slate-gray">Quem assina</p>
          <div className="mt-1.5 space-y-2">
            {etapa.vagas.map((v, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <EditorVaga vaga={v} pessoas={pessoas} cargos={cargos} onChange={(x) => set({ vagas: etapa.vagas.map((y, k) => (k === i ? x : y)) })} />
                {etapa.vagas.length > 1 && (
                  <IconeBotao rotulo="Tirar assinante" onClick={() => set({ vagas: etapa.vagas.filter((_, k) => k !== i) })}><X className="size-4" /></IconeBotao>
                )}
              </div>
            ))}
            {etapa.vagas.length < MAX_VAGAS && (
              <button type="button" onClick={() => set({ vagas: [...etapa.vagas, vagaNova()] })}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-electric-cobalt hover:bg-lavender-mist">
                <UserPlus className="size-4" aria-hidden /> Adicionar assinante
              </button>
            )}
          </div>

          {etapa.vagas.length > 1 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-gray">Regra</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup">
                {([['todos', 'Todos precisam assinar'], ['um', 'Basta um assinar']] as const).map(([r, t]) => (
                  <button key={r} type="button" role="radio" aria-checked={etapa.regra === r}
                    onClick={() => set({ regra: r, gozo_imediato: r === 'todos' && etapa.gozo_imediato })}
                    className={`min-h-[36px] rounded-full px-3.5 text-xs font-semibold ${
                      etapa.regra === r ? 'bg-electric-cobalt text-white' : 'border border-linha bg-white text-slate-gray'}`}>{t}</button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-violet-700">
              <input type="checkbox" checked={!!etapa.substituto} className="size-4 accent-violet-600"
                onChange={(e) => set({ substituto: e.target.checked ? { tipo: 'unidade', valor: 'supervisor' } : null })} />
              Substituto na ausência (férias ou afastamento médico)
            </label>
            {etapa.substituto && (
              <div className="mt-2">
                <EditorVaga vaga={etapa.substituto} pessoas={pessoas} cargos={cargos} onChange={(x) => set({ substituto: x })} />
                <p className="mt-1.5 text-[11px] text-slate-gray">
                  {etapa.regra === 'um' && etapa.vagas.length > 1
                    ? 'Como basta um, o substituto só assina com todos os titulares ausentes.'
                    : 'Assina no lugar de quem estiver ausente. Com a ausência registrada no sistema não precisa declarar o motivo.'}
                </p>
              </div>
            )}
          </div>

          {podeGozo && (
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-gray">
              <input type="checkbox" checked={etapa.gozo_imediato} onChange={(e) => set({ gozo_imediato: e.target.checked })} className="mt-0.5 size-4 accent-electric-cobalt" />
              <span>Folga para gozo imediato: um dos dois pode assinar pelos dois quando o outro estiver ausente e ciente.</span>
            </label>
          )}

          <p className="mt-3 text-xs text-ink-charcoal">
            <span className="text-slate-gray">Resumo: </span>{quemAssina(etapa, nomes)}
            {n < total - 1 ? ', depois segue para a próxima etapa.' : n === total - 1 && total > 1 ? '. Última etapa: aprova o pedido.' : '. Aprova o pedido.'}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Um assinante: tipo (cargo na unidade, papel, cargo escrito, pessoa) + qual */
function EditorVaga({ vaga, onChange, pessoas, cargos }: { vaga: VagaFluxo; onChange: (v: VagaFluxo) => void; pessoas: Pessoa[]; cargos: string[] }) {
  const tipos: Opcao[] = (Object.keys(TIPOS_VAGA) as TipoVaga[]).map((t) => ({ valor: t, rotulo: TIPOS_VAGA[t].rotulo, detalhe: TIPOS_VAGA[t].descricao }));
  const opcoes: Opcao[] = vaga.tipo === 'unidade' ? Object.entries(CARGOS_UNIDADE).map(([valor, rotulo]) => ({ valor, rotulo }))
    : vaga.tipo === 'papel' ? Object.entries(PAPEIS_ASSINANTES).map(([valor, rotulo]) => ({ valor, rotulo: valor === 'enfermeiro' || valor === 'gerente' || valor === 'supervisor' ? `${rotulo} (qualquer unidade)` : rotulo }))
    : vaga.tipo === 'cargo' ? cargos.map((c) => ({ valor: c, rotulo: c }))
    : pessoas.filter((p) => p.ativo).map((p) => ({ valor: p.id, rotulo: p.nome, detalhe: [p.matricula, p.cargo].filter(Boolean).join(' | ') }));
  const padrao: Record<TipoVaga, string> = { unidade: 'gerente', papel: 'direcao', cargo: '', pessoa: '' };
  return (
    <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <Escolha valor={vaga.tipo} onChange={(t) => onChange({ tipo: t as TipoVaga, valor: padrao[t as TipoVaga] })} opcoes={tipos} rotulo="Tipo de assinante" compacto />
      <Escolha valor={vaga.valor} onChange={(v) => onChange({ ...vaga, valor: v })} opcoes={opcoes} compacto livre={vaga.tipo === 'cargo'}
        rotulo={vaga.tipo === 'pessoa' ? 'Pessoa' : vaga.tipo === 'cargo' ? 'Cargo' : 'Qual'}
        placeholder={vaga.tipo === 'pessoa' ? 'Digite o nome ou a matrícula' : vaga.tipo === 'cargo' ? 'Digite o cargo (como está no cadastro)' : 'Escolha'} />
    </div>
  );
}

function IconeBotao({ rotulo, onClick, perigo = false, children }: { rotulo: string; onClick?: () => void; perigo?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={rotulo} aria-label={rotulo} onClick={onClick} disabled={!onClick}
      className={`flex size-10 shrink-0 items-center justify-center rounded-xl border border-linha bg-white disabled:opacity-30 ${
        perigo ? 'text-danger hover:bg-danger-light' : 'text-slate-gray hover:text-electric-cobalt'}`}>
      {children}
    </button>
  );
}
