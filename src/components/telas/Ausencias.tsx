'use client';

import { useMemo, useState } from 'react';
import { CalendarOff, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { dataBR, hojeISO, mensagemErro } from '@/lib/formato';
import { MOTIVOS_AUSENCIA, ROTULO_VAGA, periodo, type MotivoAusencia } from '@/lib/solicitacoes';
import type { Perfil } from '@/lib/types';
import { Aviso, Botao, Cabecalho, Campo, Selo, TabelaWrap, Vazio, inputCls, tdCls, thCls } from '@/components/ui';

type Chefia = { id: string; nome: string; papel: 'enfermeiro' | 'gerente'; unidade_id: string; unidade: { nome: string } | null };
type Ausencia = {
  id: string; perfil_id: string; perfil_nome: string; papel: string; unidade_id: string | null; inicio: string; fim: string;
  motivo: MotivoAusencia; observacao: string | null; registrado_nome: string | null; solicitacao_id: string | null;
};
type Form = { perfil_id: string; inicio: string; fim: string; motivo: MotivoAusencia | ''; obs: string };

/**
 * Férias e afastamentos de Enfermeiros responsáveis e Gerentes.
 * Com a ausência registrada, o substituto (Supervisor, ou Gerente em saída/estágio) assina sem precisar declarar o motivo.
 */
export default function Ausencias({ perfil }: { perfil: Perfil }) {
  const supabase = useMemo(() => createClient(), []);
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verPassadas, setVerPassadas] = useState(false);
  const hoje = hojeISO();

  const { dados, erro: erroCarga, recarregar } = useConsulta(`ausencias:${perfil.id}`, async () => {
    const [c, a] = await Promise.all([
      supabase.from('perfis').select('id, nome, papel, unidade_id, unidade:unidades!perfis_unidade_id_fkey(nome)').in('papel', ['enfermeiro', 'gerente']).eq('ativo', true).order('nome'),
      supabase.from('ausencias').select('id, perfil_id, perfil_nome, papel, unidade_id, inicio, fim, motivo, observacao, registrado_nome, solicitacao_id')
        .order('inicio', { ascending: false }).limit(500),
    ]);
    if (c.error || a.error) throw new Error((c.error ?? a.error)!.message);
    return { chefias: (c.data as unknown as Chefia[]) ?? [], ausencias: (a.data as Ausencia[]) ?? [] };
  });

  // Quem esta pessoa pode registrar (o banco confere de novo)
  const gerenciaveis = useMemo(() => (dados?.chefias ?? []).filter((c) =>
    perfil.papel === 'direcao' || perfil.papel === 'coordenacao' || c.id === perfil.id
    || (perfil.papel === 'gerente' && c.unidade_id === perfil.unidade_id)
    || (perfil.papel === 'supervisor' && (perfil.supervisiona ?? []).includes(c.unidade_id))), [dados, perfil]);
  const podeGerir = (perfilId: string) => gerenciaveis.some((g) => g.id === perfilId);

  // Situação de hoje, por unidade: Enfermeiro e Gerente presentes?
  const unidades = useMemo(() => {
    const m = new Map<string, { nome: string; enfermeiro: Chefia[]; gerente: Chefia[] }>();
    for (const c of dados?.chefias ?? []) {
      if (!m.has(c.unidade_id)) m.set(c.unidade_id, { nome: c.unidade?.nome ?? 'Unidade', enfermeiro: [], gerente: [] });
      m.get(c.unidade_id)![c.papel].push(c);
    }
    return [...m.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR'));
  }, [dados]);
  const ausenteHoje = (id: string) => (dados?.ausencias ?? []).find((a) => a.perfil_id === id && a.inicio <= hoje && a.fim >= hoje);

  const atuais = (dados?.ausencias ?? []).filter((a) => a.fim >= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const passadas = (dados?.ausencias ?? []).filter((a) => a.fim < hoje);

  async function salvar() {
    if (!form) return;
    if (!form.perfil_id) return setErro('Escolha a pessoa.');
    if (!form.motivo) return setErro('Escolha o motivo.');
    if (!form.inicio || !form.fim || form.fim < form.inicio) return setErro('Confira o período.');
    setOcupado('form');
    const { error } = await supabase.rpc('registrar_ausencia', {
      p_perfil: form.perfil_id, p_inicio: form.inicio, p_fim: form.fim, p_motivo: form.motivo, p_obs: form.obs.trim() || null,
    });
    setOcupado(null);
    if (error) return setErro(mensagemErro(error));
    const nome = gerenciaveis.find((g) => g.id === form.perfil_id)?.nome;
    setForm(null);
    setErro(null);
    setOk(`Ausência de ${nome} registrada.`);
    recarregar();
  }

  async function remover(a: Ausencia) {
    if (!window.confirm(`Remover a ausência de ${a.perfil_nome} (${periodo({ data_inicio: a.inicio, data_fim: a.fim })})?`)) return;
    setOcupado(a.id);
    const { error } = await supabase.rpc('remover_ausencia', { p_id: a.id });
    setOcupado(null);
    if (error) return setErro(mensagemErro(error));
    setOk('Ausência removida.');
    recarregar();
  }

  const novo = (): Form => ({
    perfil_id: gerenciaveis.length === 1 ? gerenciaveis[0].id : '', inicio: hoje, fim: hoje, motivo: '', obs: '',
  });

  return (
    <div className="w-full space-y-6">
      <Cabecalho icone={CalendarOff} titulo="Ausências das chefias"
        descricao="Férias e afastamento médico de Enfermeiros responsáveis e Gerentes. Durante a ausência registrada, o Supervisor assina no lugar sem precisar declarar o motivo." />

      {(erro || erroCarga) && <Aviso>{erro ?? erroCarga}</Aviso>}
      {ok && <Aviso tom="info">{ok}</Aviso>}

      {/* Hoje, por unidade */}
      <section>
        <h2 className="text-sm font-bold text-ink-charcoal">Hoje nas unidades</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {!dados && <p className="text-sm text-tinta-suave">Carregando…</p>}
          {dados && unidades.length === 0 && <Vazio>Nenhum Enfermeiro responsável ou Gerente cadastrado nas suas unidades.</Vazio>}
          {unidades.map(([id, u]) => (
            <div key={id} className="dock-card p-4">
              <p className="text-sm font-bold text-ink-charcoal">{u.nome}</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {(['enfermeiro', 'gerente'] as const).map((v) => {
                  const lista = u[v];
                  if (!lista.length) {
                    return <li key={v} className="flex items-center gap-2 text-warning"><UserX className="size-4" aria-hidden /> {ROTULO_VAGA[v]}: não cadastrado</li>;
                  }
                  return lista.map((c) => {
                    const fora = ausenteHoje(c.id);
                    return (
                      <li key={c.id} className={`flex items-center gap-2 ${fora ? 'text-danger' : 'text-mid-graphite'}`}>
                        {fora ? <UserX className="size-4 shrink-0" aria-hidden /> : <UserCheck className="size-4 shrink-0 text-forest" aria-hidden />}
                        <span className="min-w-0 truncate">{ROTULO_VAGA[v]}: <strong>{c.nome}</strong>{fora ? ` (${fora.motivo} até ${dataBR(fora.fim)})` : ''}</span>
                      </li>
                    );
                  });
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Registro */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink-charcoal">Ausências atuais e próximas</h2>
          {gerenciaveis.length > 0 && !form && (
            <Botao onClick={() => { setForm(novo()); setOk(null); setErro(null); }}><Plus className="size-4" aria-hidden /> Registrar ausência</Botao>
          )}
        </div>

        {form && (
          <div className="dock-card border-2 !border-electric-cobalt/30 p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Campo rotulo="Pessoa *" className="xl:col-span-2">
                <select value={form.perfil_id} onChange={(e) => setForm({ ...form, perfil_id: e.target.value })} className={inputCls}>
                  <option value="">Selecione</option>
                  {gerenciaveis.map((g) => (
                    <option key={g.id} value={g.id}>{g.nome} | {ROTULO_VAGA[g.papel]} | {g.unidade?.nome}</option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Motivo *">
                <select value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value as MotivoAusencia })} className={inputCls}>
                  <option value="">Selecione</option>
                  {MOTIVOS_AUSENCIA.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Campo>
              <Campo rotulo="De *">
                <input type="date" value={form.inicio} className={inputCls}
                  onChange={(e) => setForm({ ...form, inicio: e.target.value, fim: form.fim < e.target.value ? e.target.value : form.fim })} />
              </Campo>
              <Campo rotulo="Até *">
                <input type="date" value={form.fim} min={form.inicio} onChange={(e) => setForm({ ...form, fim: e.target.value })} className={inputCls} />
              </Campo>
              <Campo rotulo="Observação (opcional)" className="sm:col-span-2 xl:col-span-5" dica="Não informe diagnóstico: basta o motivo e o período.">
                <input value={form.obs} maxLength={300} onChange={(e) => setForm({ ...form, obs: e.target.value })} className={inputCls} />
              </Campo>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Botao variante="discreto" onClick={() => setForm(null)}>Cancelar</Botao>
              <Botao carregando={ocupado === 'form'} onClick={salvar}>Registrar</Botao>
            </div>
          </div>
        )}

        <TabelaAusencias itens={atuais} hoje={hoje} podeGerir={podeGerir} ocupado={ocupado} onRemover={remover}
          vazio="Nenhuma ausência em andamento ou marcada." />

        {passadas.length > 0 && (
          <div>
            <button type="button" onClick={() => setVerPassadas((v) => !v)} className="text-sm font-semibold text-electric-cobalt hover:underline">
              {verPassadas ? 'Ocultar' : 'Ver'} ausências anteriores ({passadas.length})
            </button>
            {verPassadas && <div className="mt-3"><TabelaAusencias itens={passadas} hoje={hoje} podeGerir={() => false} ocupado={null} onRemover={remover} vazio="" /></div>}
          </div>
        )}
      </section>
    </div>
  );
}

function TabelaAusencias({ itens, hoje, podeGerir, ocupado, onRemover, vazio }: {
  itens: Ausencia[]; hoje: string; podeGerir: (id: string) => boolean; ocupado: string | null; onRemover: (a: Ausencia) => void; vazio: string;
}) {
  if (!itens.length) return vazio ? <Vazio>{vazio}</Vazio> : null;
  return (
    <TabelaWrap>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={thCls}>Pessoa</th><th className={thCls}>Período</th><th className={thCls}>Motivo</th>
            <th className={thCls}>Registrado por</th><th className={thCls}><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((a) => (
            <tr key={a.id} className="hover:bg-faint-gray">
              <td className={tdCls}>
                <span className="font-medium">{a.perfil_nome}</span>
                <span className="block text-xs text-tinta-suave">{ROTULO_VAGA[a.papel] ?? a.papel}</span>
              </td>
              <td className={`${tdCls} whitespace-nowrap`}>
                {periodo({ data_inicio: a.inicio, data_fim: a.fim })}
                {a.inicio <= hoje && a.fim >= hoje && <span className="ml-2"><Selo texto="Hoje" /></span>}
              </td>
              <td className={tdCls}>{a.motivo}{a.observacao && <span className="block text-xs text-tinta-suave">{a.observacao}</span>}</td>
              <td className={`${tdCls} text-xs text-tinta-suave`}>{a.solicitacao_id ? 'Férias aprovadas no sistema' : a.registrado_nome ?? ''}</td>
              <td className={`${tdCls} text-right`}>
                {podeGerir(a.perfil_id) && (
                  <button type="button" onClick={() => onRemover(a)} disabled={ocupado === a.id}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-gray hover:bg-danger-light hover:text-danger">
                    <Trash2 className="size-3.5" aria-hidden /> Remover
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabelaWrap>
  );
}
