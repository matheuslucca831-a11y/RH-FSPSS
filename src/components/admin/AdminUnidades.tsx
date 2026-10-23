'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemErro } from '@/lib/formato';
import { Aviso, Botao, Campo, Selo, TabelaWrap, campoCls, inputCls, tdCls, thCls } from '@/components/ui';

type Unidade = { id: string; nome: string; sigla: string | null; ativa: boolean };
type Equipe = { unidade_id: string | null; papel: string; ativo: boolean };

export default function AdminUnidades() {
  const supabase = useMemo(() => createClient(), []);
  const [lista, setLista] = useState<Unidade[] | null>(null);
  const [equipe, setEquipe] = useState<Equipe[]>([]);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nova, setNova] = useState<{ nome: string; sigla: string } | null>(null);
  const [editando, setEditando] = useState<Unidade | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.from('unidades').select('id, nome, sigla, ativa').order('nome'),
      supabase.from('perfis').select('unidade_id, papel, ativo'),
    ]).then(([u, p]) => {
      if (!vivo) return;
      setLista((u.data as Unidade[]) ?? []);
      setEquipe((p.data as Equipe[]) ?? []);
      setErro(u.error ? mensagemErro(u.error) : null);
    });
    return () => {
      vivo = false;
    };
  }, [supabase, versao]);

  const conta = (id: string, papel?: string) => equipe.filter((e) => e.unidade_id === id && e.ativo && (!papel || e.papel === papel)).length;

  function concluir(m: string) {
    setOk(m);
    setErro(null);
    setVersao((v) => v + 1);
  }

  async function salvarNova() {
    if (!nova?.nome.trim()) return setErro('Informe o nome da unidade.');
    setOcupado(true);
    const { error } = await supabase.from('unidades').insert({ nome: nova.nome.trim(), sigla: nova.sigla.trim() || null });
    setOcupado(false);
    if (error) return setErro(error.code === '23505' ? 'Já existe uma unidade com esse nome.' : mensagemErro(error));
    setNova(null);
    concluir('Unidade cadastrada.');
  }

  async function salvarEdicao() {
    if (!editando?.nome.trim()) return setErro('Informe o nome da unidade.');
    setOcupado(true);
    const { error } = await supabase.from('unidades').update({ nome: editando.nome.trim(), sigla: editando.sigla?.trim() || null }).eq('id', editando.id);
    setOcupado(false);
    if (error) return setErro(error.code === '23505' ? 'Já existe uma unidade com esse nome.' : mensagemErro(error));
    setEditando(null);
    concluir('Unidade atualizada. Os pedidos antigos guardam o nome da época.');
  }

  async function alternar(u: Unidade) {
    if (u.ativa && conta(u.id) > 0 && !window.confirm(`${u.nome} tem ${conta(u.id)} pessoa(s) ativa(s). Desativar mesmo assim? Elas continuam entrando; só não dá para cadastrar ninguém novo nela.`)) return;
    const { error } = await supabase.from('unidades').update({ ativa: !u.ativa }).eq('id', u.id);
    if (error) return setErro(mensagemErro(error));
    concluir(u.ativa ? `${u.nome} desativada.` : `${u.nome} reativada.`);
  }

  return (
    <>
      <div className="dock-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-electric-cobalt text-white shadow-xs"><Building2 className="size-6" aria-hidden /></div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink-charcoal">Unidades</h2>
            <p className="mt-0.5 text-xs text-slate-gray">Cada funcionário e chefia pertence a uma unidade. A chefia analisa os pedidos de quem é da mesma unidade.</p>
          </div>
        </div>
        <Botao onClick={() => { setNova({ nome: '', sigla: '' }); setOk(null); }}><Plus className="size-4" aria-hidden /> Nova unidade</Botao>
      </div>

      {erro && <div className="mt-4"><Aviso>{erro}</Aviso></div>}
      {ok && <div className="mt-4"><Aviso tom="info">{ok}</Aviso></div>}

      {nova && (
        <div className="dock-card mt-4 border-2 !border-electric-cobalt/30 bg-powder-blue/10 p-5">
          <h3 className="text-sm font-bold">Nova unidade</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Campo rotulo="Nome *"><input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Ex.: USF Boiçucanga" className={inputCls} /></Campo>
            <Campo rotulo="Sigla"><input value={nova.sigla} onChange={(e) => setNova({ ...nova, sigla: e.target.value })} className={inputCls} /></Campo>
          </div>
          <div className="mt-3 flex gap-2">
            <Botao carregando={ocupado} onClick={salvarNova}>Cadastrar</Botao>
            <Botao variante="discreto" onClick={() => setNova(null)}>Cancelar</Botao>
          </div>
        </div>
      )}

      <div className="mt-4">
        <TabelaWrap>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>Unidade</th><th className={thCls}>Sigla</th>
                <th className={`${thCls} text-right`}>Chefias</th><th className={`${thCls} text-right`}>Funcionários</th>
                <th className={thCls}>Situação</th><th className={thCls}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {!lista && <tr><td colSpan={6} className={`${tdCls} text-tinta-suave`}>Carregando…</td></tr>}
              {lista?.length === 0 && <tr><td colSpan={6} className={`${tdCls} text-tinta-suave`}>Nenhuma unidade cadastrada.</td></tr>}
              {lista?.map((u) => {
                const ed = editando?.id === u.id ? editando : null;
                const chefias = conta(u.id, 'chefia');
                return (
                  <tr key={u.id} className="hover:bg-faint-gray">
                    <td className={`${tdCls} font-medium`}>
                      {ed ? <input value={ed.nome} onChange={(e) => setEditando({ ...ed, nome: e.target.value })} aria-label="Nome" className={`${campoCls} w-full`} /> : u.nome}
                    </td>
                    <td className={tdCls}>
                      {ed ? <input value={ed.sigla ?? ''} maxLength={20} onChange={(e) => setEditando({ ...ed, sigla: e.target.value })} aria-label="Sigla" className={`${campoCls} w-24`} /> : u.sigla ?? ''}
                    </td>
                    <td className={`${tdCls} text-right tabular-nums`}>
                      {chefias}{u.ativa && chefias === 0 && conta(u.id) > 0 && (
                        <span className="ml-2 rounded-full border border-warning/20 bg-warning-light px-2 py-0.5 text-[11px] font-semibold text-warning" title="Os pedidos desta unidade só podem ser decididos pela Direção">sem chefia</span>
                      )}
                    </td>
                    <td className={`${tdCls} text-right tabular-nums`}>{conta(u.id, 'funcionario')}</td>
                    <td className={tdCls}><Selo texto={u.ativa ? 'Ativa' : 'Inativa'} /></td>
                    <td className={`${tdCls} whitespace-nowrap text-right`}>
                      {ed ? (
                        <div className="flex justify-end gap-1">
                          <Botao className="px-2.5 py-1.5 text-xs" carregando={ocupado} onClick={salvarEdicao}>Salvar</Botao>
                          <Botao variante="discreto" className="px-2.5 py-1.5 text-xs" onClick={() => setEditando(null)}>Cancelar</Botao>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Botao variante="discreto" className="px-2.5 py-1.5 text-xs" onClick={() => { setEditando(u); setOk(null); }}>Editar</Botao>
                          <Botao variante="discreto" className="px-2.5 py-1.5 text-xs" onClick={() => alternar(u)}>{u.ativa ? 'Desativar' : 'Reativar'}</Botao>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TabelaWrap>
      </div>
    </>
  );
}
