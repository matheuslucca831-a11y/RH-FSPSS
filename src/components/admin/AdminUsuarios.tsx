'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock, KeyRound, MapPin, Pencil, Plus, Power, RefreshCw, Smartphone, Users, Wand2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { dataHoraBR, mensagemErro, normalizar } from '@/lib/formato';
import { matriculaValida } from '@/lib/login';
import { problemaSenha } from '@/lib/acesso';
import {
  criarUsuario, definirAtivo, gerarSenhaTemporaria, liberarNovoCelular, mudarMatricula, redefinirSenha, type NovoUsuario,
} from '@/lib/adminUsuarios';
import { PAPEIS, type Papel } from '@/lib/types';
import { iniciais } from '@/components/Shell';
import { Aviso, Botao, Campo, CampoBusca, Selo, campoCls, inputCls } from '@/components/ui';
import { Paginacao, usePaginacao } from '@/components/Paginacao';

type Usuario = {
  id: string; nome: string; matricula: string; email: string | null; cargo: string | null; papel: Papel;
  unidade_id: string | null; ativo: boolean; deve_trocar_senha: boolean; ultimo_acesso_em: string | null;
  unidade: { nome: string } | null;
};
type Unidade = { id: string; nome: string; ativa: boolean };
type Filtro = 'todos' | Papel | 'ativos' | 'inativos';

const NOVO: NovoUsuario = { nome: '', matricula: '', senha: '', cargo: '', papel: 'funcionario', unidade_id: null };
const CARGOS = ['Agente Comunitário de Saúde', 'Auxiliar Administrativo', 'Técnico de Enfermagem', 'Auxiliar de Enfermagem',
  'Enfermeiro(a)', 'Médico(a)', 'Dentista', 'Supervisor(a)', 'Gerente', 'Gestor(a)'];
const ORDEM_PAPEL: Papel[] = ['direcao', 'chefia', 'funcionario'];
const BADGE: Record<Papel, string> = {
  direcao: 'border-electric-cobalt/30 bg-electric-cobalt text-white',
  chefia: 'border-warning/25 bg-warning-light text-warning',
  funcionario: 'border-sky-200/70 bg-sky-50 text-sky-700',
};

export default function AdminUsuarios({ meuId }: { meuId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [fUnidade, setFUnidade] = useState('');
  const [novo, setNovo] = useState<NovoUsuario | null>(null);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [senha, setSenha] = useState<{ id: string; valor: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.from('perfis').select('id, nome, matricula, email, cargo, papel, unidade_id, ativo, deve_trocar_senha, ultimo_acesso_em, unidade:unidades(nome)').order('nome'),
      supabase.from('unidades').select('id, nome, ativa').order('nome'),
    ]).then(([p, u]) => {
      if (!vivo) return;
      const ordenada = ((p.data as unknown as Usuario[]) ?? [])
        .sort((a, b) => ORDEM_PAPEL.indexOf(a.papel) - ORDEM_PAPEL.indexOf(b.papel) || a.nome.localeCompare(b.nome, 'pt-BR'));
      setLista(ordenada);
      setUnidades((u.data as Unidade[]) ?? []);
      setErro(p.error ? mensagemErro(p.error) : null);
    });
    return () => {
      vivo = false;
    };
  }, [supabase, versao]);

  const totais = useMemo(() => {
    const l = lista ?? [];
    return {
      todos: l.length, direcao: l.filter((u) => u.papel === 'direcao').length, chefia: l.filter((u) => u.papel === 'chefia').length,
      funcionario: l.filter((u) => u.papel === 'funcionario').length, ativos: l.filter((u) => u.ativo).length, inativos: l.filter((u) => !u.ativo).length,
    } as Record<Filtro, number>;
  }, [lista]);

  const visiveis = useMemo(() => {
    const t = normalizar(busca);
    return (lista ?? []).filter((u) =>
      (filtro === 'todos' || (filtro === 'ativos' ? u.ativo : filtro === 'inativos' ? !u.ativo : u.papel === filtro))
      && (!fUnidade || u.unidade_id === fUnidade)
      && (!t || normalizar(`${u.nome} ${u.matricula} ${u.cargo} ${u.unidade?.nome}`).includes(t)));
  }, [lista, busca, filtro, fUnidade]);
  const pag = usePaginacao(visiveis, 25);

  function concluir(msg: string) {
    setOk(msg);
    setErro(null);
    setVersao((v) => v + 1);
  }
  function limpar() {
    setOk(null);
    setErro(null);
  }

  async function salvarNovo() {
    if (!novo) return;
    if (novo.nome.trim().length < 2) return setErro('Informe o nome completo.');
    if (!matriculaValida(novo.matricula)) return setErro('Informe a matrícula (só letras, números e ponto).');
    const p = problemaSenha(novo.senha, novo.matricula);
    if (p) return setErro(`Senha inicial: ${p}`);
    if (novo.papel !== 'direcao' && !novo.unidade_id) return setErro('Escolha a unidade.');
    setOcupado('novo');
    const r = await criarUsuario(novo);
    setOcupado(null);
    if (r.erro) return setErro(r.erro);
    setNovo(null);
    concluir(`Acesso criado para ${novo.nome}. Passe a matrícula ${novo.matricula.trim()} e a senha inicial ${novo.senha}. No primeiro acesso a pessoa cria a senha dela.`);
  }

  async function salvarEdicao() {
    if (!editando) return;
    const antes = lista?.find((u) => u.id === editando.id);
    if (editando.papel !== 'direcao' && !editando.unidade_id) return setErro('Escolha a unidade.');
    if (!matriculaValida(editando.matricula)) return setErro('Matrícula inválida.');
    setOcupado(editando.id);
    if (antes && antes.matricula !== editando.matricula.trim()) {
      const r = await mudarMatricula(editando.id, editando.matricula);
      if (r.erro) { setOcupado(null); return setErro(r.erro); }
    }
    const { error } = await supabase.from('perfis').update({
      nome: editando.nome.trim(), cargo: editando.cargo?.trim() || null, papel: editando.papel,
      unidade_id: editando.papel === 'direcao' ? null : editando.unidade_id,
    }).eq('id', editando.id);
    setOcupado(null);
    if (error) return setErro(mensagemErro(error));
    setEditando(null);
    concluir('Usuário atualizado.');
  }

  async function alternarAtivo(u: Usuario) {
    if (u.id === meuId) return setErro('Você não pode desativar o seu próprio acesso.');
    if (u.ativo && !window.confirm(`Desativar o acesso de ${u.nome}? A pessoa sai na hora de todos os aparelhos e não consegue mais entrar. Os pedidos dela ficam guardados.`)) return;
    setOcupado(u.id);
    const r = await definirAtivo(u.id, !u.ativo);
    setOcupado(null);
    if (r.erro) return setErro(r.erro);
    concluir(u.ativo ? `Acesso de ${u.nome} desativado.` : `Acesso de ${u.nome} reativado.`);
  }

  async function trocarSenha() {
    if (!senha) return;
    const u = lista?.find((x) => x.id === senha.id);
    const p = problemaSenha(senha.valor, u?.matricula);
    if (p) return setErro(p);
    setOcupado(senha.id);
    const r = await redefinirSenha(senha.id, senha.valor);
    setOcupado(null);
    if (r.erro) return setErro(r.erro);
    setSenha(null);
    concluir(`Senha temporária definida: ${senha.valor}. Passe para ${u?.nome ?? 'a pessoa'}; no próximo acesso ela cria uma senha nova.`);
  }

  async function novoCelular(u: Usuario) {
    if (!window.confirm(`Liberar o cadastro de um novo celular para ${u.nome}? O app autenticador atual deixa de valer.`)) return;
    setOcupado(u.id);
    const r = await liberarNovoCelular(u.id);
    setOcupado(null);
    if (r.erro) return setErro(r.erro);
    concluir(`Pronto. No próximo acesso, ${u.nome} cadastra o app autenticador no celular novo.`);
  }

  const unidadesAtivas = unidades.filter((u) => u.ativa);
  const FILTROS: [Filtro, string][] = [
    ['todos', 'Todos'], ['funcionario', 'Funcionários'], ['chefia', 'Chefias'], ['direcao', 'Direção'], ['ativos', 'Ativos'], ['inativos', 'Inativos'],
  ];

  return (
    <div className="space-y-5">
      <datalist id="cargos">{CARGOS.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="dock-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-electric-cobalt text-white shadow-xs"><Users className="size-6" aria-hidden /></div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink-charcoal">Usuários e acessos</h2>
            <p className="mt-0.5 text-xs text-slate-gray">Crie acessos, defina o tipo e a unidade, redefina senhas e libere um novo celular.</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => setVersao((v) => v + 1)} className="dock-btn-ghost !px-4 text-xs font-semibold">
            <RefreshCw className="size-3.5" aria-hidden /> Atualizar
          </button>
          <button type="button" onClick={() => { setNovo({ ...NOVO, senha: gerarSenhaTemporaria() }); limpar(); }} className="dock-btn-primary text-xs font-semibold">
            <Plus className="size-4" aria-hidden /> Novo usuário
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtrar usuários">
          {FILTROS.map(([v, r]) => (
            <button key={v} type="button" role="tab" aria-selected={filtro === v} onClick={() => setFiltro(v)}
              className={`min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                filtro === v ? 'bg-electric-cobalt text-white shadow-xs' : 'border border-linha bg-white text-slate-gray hover:text-ink-charcoal'}`}>
              {r} <span className="opacity-80">({totais[v]})</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <select value={fUnidade} onChange={(e) => setFUnidade(e.target.value)} aria-label="Filtrar por unidade" className={`${campoCls} max-w-56 !rounded-full`}>
            <option value="">Todas as unidades</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <CampoBusca valor={busca} onChange={setBusca} placeholder="Nome, matrícula ou cargo" className="w-full sm:w-72" />
        </div>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tom="info">{ok}</Aviso>}

      {novo && (
        <div className="dock-card border-2 !border-electric-cobalt/30 bg-powder-blue/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linha pb-3">
            <h3 className="text-sm font-bold text-ink-charcoal">Novo usuário</h3>
            <span className="text-xs text-slate-gray">A senha inicial é temporária: a pessoa troca no primeiro acesso</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Nome completo *"><input value={novo.nome} maxLength={150} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} className={inputCls} /></Campo>
            <Campo rotulo="Matrícula (login) *"><input value={novo.matricula} maxLength={40} onChange={(e) => setNovo({ ...novo, matricula: e.target.value })} className={inputCls} autoComplete="off" /></Campo>
            <Campo rotulo="Senha inicial *" dica="Letras e números, mínimo 8">
              <div className="flex gap-2">
                <input value={novo.senha} maxLength={72} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} className={`${inputCls} font-mono`} autoComplete="new-password" />
                <button type="button" title="Gerar outra senha" aria-label="Gerar outra senha" onClick={() => setNovo({ ...novo, senha: gerarSenhaTemporaria() })}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-linha bg-white text-slate-gray hover:text-electric-cobalt">
                  <Wand2 className="size-4" />
                </button>
              </div>
            </Campo>
            <Campo rotulo="Cargo"><input list="cargos" value={novo.cargo} maxLength={120} onChange={(e) => setNovo({ ...novo, cargo: e.target.value })} className={inputCls} /></Campo>
            <Campo rotulo="Tipo de acesso" dica={PAPEIS[novo.papel].descricao}>
              <select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value as Papel })} className={inputCls}>
                {(Object.keys(PAPEIS) as Papel[]).map((p) => <option key={p} value={p}>{PAPEIS[p].rotulo}</option>)}
              </select>
            </Campo>
            {novo.papel !== 'direcao' && (
              <Campo rotulo="Unidade *">
                <select value={novo.unidade_id ?? ''} onChange={(e) => setNovo({ ...novo, unidade_id: e.target.value || null })} className={inputCls}>
                  <option value="">Selecione</option>
                  {unidadesAtivas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </Campo>
            )}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 border-t border-linha pt-3">
            <Botao variante="discreto" onClick={() => setNovo(null)}>Cancelar</Botao>
            <Botao carregando={ocupado === 'novo'} onClick={salvarNovo}>Criar acesso</Botao>
          </div>
        </div>
      )}

      {!lista ? (
        <div className="dock-card p-12 text-center text-xs text-slate-gray">
          <RefreshCw className="mx-auto mb-2 size-5 animate-spin text-electric-cobalt" aria-hidden />
          Carregando usuários
        </div>
      ) : visiveis.length === 0 ? (
        <div className="dock-card p-12 text-center text-sm text-slate-gray">Nenhum usuário encontrado com esses filtros.</div>
      ) : (
        <div className="space-y-3">
          {pag.visiveis.map((u) => {
            const ed = editando?.id === u.id ? editando : null;
            const sn = senha?.id === u.id ? senha : null;
            return (
              <div key={u.id} className={`dock-card flex flex-col justify-between gap-4 p-4 transition-all hover:border-electric-cobalt/40 sm:p-5 lg:flex-row lg:items-start ${u.ativo ? '' : 'opacity-75'}`}>
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-electric-cobalt/25 bg-powder-blue/30 text-sm font-extrabold text-electric-cobalt shadow-xs">
                    {iniciais(u.nome)}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold uppercase tracking-tight text-ink-charcoal">{u.nome}</span>
                      {u.id === meuId && <span className="text-xs font-semibold text-slate-gray">(você)</span>}
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${BADGE[u.papel]}`}>{PAPEIS[u.papel].rotulo}</span>
                      {u.deve_trocar_senha && u.ativo && <Selo texto="Troca de senha pendente" />}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-gray">
                      <span className="font-mono text-mid-graphite">Matrícula: {u.matricula}</span>
                      {u.cargo && <span>{u.cargo}</span>}
                      <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden />
                        {u.ultimo_acesso_em ? `Último acesso: ${dataHoraBR(u.ultimo_acesso_em)}` : 'Nunca entrou'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-electric-cobalt/20 bg-powder-blue/25 px-3 py-0.5 text-[11px] font-semibold text-electric-cobalt">
                        <MapPin className="size-3" aria-hidden /> Lotação: {u.unidade?.nome ?? (u.papel === 'direcao' ? 'Sede' : 'Não vinculada')}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-gray">
                        <span className={`size-2 rounded-full ${u.ativo ? 'bg-forest' : 'bg-steel-gray'}`} aria-hidden /> {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    {ed && (
                      <div className="mt-3 space-y-3 rounded-xl border border-electric-cobalt/30 bg-powder-blue/15 p-3.5">
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                          <Campo rotulo="Nome"><input value={ed.nome} maxLength={150} onChange={(e) => setEditando({ ...ed, nome: e.target.value })} className={inputCls} /></Campo>
                          <Campo rotulo="Matrícula"><input value={ed.matricula} maxLength={40} onChange={(e) => setEditando({ ...ed, matricula: e.target.value })} className={inputCls} /></Campo>
                          <Campo rotulo="Cargo"><input list="cargos" value={ed.cargo ?? ''} maxLength={120} onChange={(e) => setEditando({ ...ed, cargo: e.target.value })} className={inputCls} /></Campo>
                          <Campo rotulo="Acesso">
                            <select value={ed.papel} disabled={u.id === meuId} onChange={(e) => setEditando({ ...ed, papel: e.target.value as Papel })} className={inputCls}>
                              {(Object.keys(PAPEIS) as Papel[]).map((p) => <option key={p} value={p}>{PAPEIS[p].rotulo}</option>)}
                            </select>
                          </Campo>
                          {ed.papel !== 'direcao' && (
                            <Campo rotulo="Unidade">
                              <select value={ed.unidade_id ?? ''} onChange={(e) => setEditando({ ...ed, unidade_id: e.target.value || null })} className={inputCls}>
                                <option value="">Selecione</option>
                                {unidadesAtivas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                              </select>
                            </Campo>
                          )}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Botao variante="discreto" onClick={() => setEditando(null)}>Cancelar</Botao>
                          <Botao carregando={ocupado === u.id} onClick={salvarEdicao}>Salvar alterações</Botao>
                        </div>
                      </div>
                    )}

                    {sn && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning-light/40 p-3.5">
                        <input value={sn.valor} onChange={(e) => setSenha({ ...sn, valor: e.target.value })} maxLength={72}
                          aria-label="Senha temporária" autoComplete="new-password" className={`${campoCls} min-w-48 flex-1 font-mono`} />
                        <button type="button" title="Gerar outra senha" aria-label="Gerar outra senha" onClick={() => setSenha({ ...sn, valor: gerarSenhaTemporaria() })}
                          className="flex size-11 items-center justify-center rounded-xl border border-linha bg-white text-slate-gray hover:text-electric-cobalt">
                          <Wand2 className="size-4" />
                        </button>
                        <Botao carregando={ocupado === u.id} onClick={trocarSenha}>Definir senha temporária</Botao>
                        <Botao variante="discreto" onClick={() => setSenha(null)}>Cancelar</Botao>
                      </div>
                    )}
                  </div>
                </div>

                {!ed && !sn && (
                  <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                    <AcaoCartao icone={Pencil} rotulo="Editar" onClick={() => { setEditando(u); limpar(); }} />
                    <AcaoCartao icone={KeyRound} rotulo="Senha" onClick={() => { setSenha({ id: u.id, valor: gerarSenhaTemporaria() }); limpar(); }} />
                    {u.papel !== 'funcionario' && u.id !== meuId && (
                      <AcaoCartao icone={Smartphone} rotulo="Novo celular" onClick={() => novoCelular(u)} />
                    )}
                    {u.id !== meuId && (
                      <AcaoCartao icone={Power} rotulo={u.ativo ? 'Desativar' : 'Reativar'} perigo={u.ativo} onClick={() => alternarAtivo(u)} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <Paginacao p={pag} rotulo="usuários" />
        </div>
      )}
    </div>
  );
}

function AcaoCartao({ icone: Icone, rotulo, onClick, perigo = false }: { icone: typeof Pencil; rotulo: string; onClick: () => void; perigo?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-linha bg-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-colors ${
        perigo ? 'text-danger hover:bg-danger-light' : 'text-mid-graphite hover:bg-faint-gray hover:text-ink-charcoal'}`}>
      <Icone className="size-3.5" aria-hidden /> {rotulo}
    </button>
  );
}
