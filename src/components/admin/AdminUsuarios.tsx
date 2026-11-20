'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Clock, GitBranch, KeyRound, MapPin, Pencil, Plus, Power, RefreshCw, Smartphone, Users, Wand2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { dataHoraBR, mensagemErro, normalizar } from '@/lib/formato';
import { matriculaValida } from '@/lib/login';
import { problemaSenha } from '@/lib/acesso';
import {
  criarUsuario, definirAtivo, gerarSenhaTemporaria, liberarNovoCelular, mudarMatricula, redefinirSenha, type NovoUsuario,
} from '@/lib/adminUsuarios';
import { PAPEIS, SEM_UNIDADE, type Papel } from '@/lib/types';
import Escolha from '@/components/Escolha';
import Janela from '@/components/Janela';
import { iniciais } from '@/components/Shell';
import { Aviso, Botao, Campo, CampoBusca, Selo, campoCls, inputCls } from '@/components/ui';
import { Paginacao, usePaginacao } from '@/components/Paginacao';

type Usuario = {
  id: string; nome: string; matricula: string; email: string | null; cargo: string | null; papel: Papel; fluxo_id: string | null;
  unidade_id: string | null; supervisiona: string[]; ativo: boolean; deve_trocar_senha: boolean; ultimo_acesso_em: string | null;
  unidade: { nome: string } | null;
};
type Unidade = { id: string; nome: string; ativa: boolean };
type FluxoResumo = { id: string; nome: string; ativo: boolean };
type Filtro = 'todos' | 'funcionario' | 'chefias' | 'gestao' | 'ativos' | 'inativos';

const NOVO: NovoUsuario = { nome: '', matricula: '', senha: '', cargo: '', papel: 'funcionario', fluxo_id: null, unidade_id: null, supervisiona: [] };
const CARGOS = ['Agente Comunitário de Saúde', 'Auxiliar Administrativo', 'Auxiliar de Serviços Gerais', 'Recepcionista',
  'Técnico de Enfermagem', 'Auxiliar de Enfermagem', 'Enfermeiro(a)', 'Médico(a)', 'Farmacêutico(a)', 'Técnico de Farmácia',
  'Supervisor(a)', 'Assessor(a)', 'Gerente de Unidade', 'Coordenador(a) de Enfermagem', 'Gestor(a)'];
const ORDEM_PAPEL: Papel[] = ['direcao', 'diretor', 'rh', 'coordenacao', 'supervisor', 'gerente', 'enfermeiro', 'funcionario'];
const BADGE: Record<Papel, string> = {
  direcao: 'border-electric-cobalt/30 bg-electric-cobalt text-white',
  coordenacao: 'border-electric-cobalt/30 bg-deep-cobalt text-white',
  diretor: 'border-electric-cobalt/30 bg-lavender-mist text-electric-cobalt',
  rh: 'border-forest/30 bg-forest text-white',
  supervisor: 'border-violet-200 bg-violet-50 text-violet-700',
  gerente: 'border-warning/25 bg-warning-light text-warning',
  enfermeiro: 'border-forest/20 bg-forest-light text-forest',
  funcionario: 'border-sky-200/70 bg-sky-50 text-sky-700',
};
const CHEFIAS: Papel[] = ['enfermeiro', 'gerente', 'supervisor'];
/** Papéis que podem ter unidades vinculadas além da lotação */
const COM_VINCULOS: Papel[] = ['enfermeiro', 'gerente', 'supervisor'];
const GESTAO: Papel[] = ['coordenacao', 'diretor', 'rh', 'direcao'];

/** Fluxo sugerido para um cadastro: o mais usado por quem tem o mesmo cargo; senão, o mais usado no mesmo tipo de acesso */
function sugerirFluxo(lista: Usuario[] | null, fluxos: FluxoResumo[], cargo: string, papel: Papel) {
  const ativos = new Set(fluxos.filter((f) => f.ativo).map((f) => f.id));
  const maisUsado = (pessoas: Usuario[]) => {
    const conta = new Map<string, number>();
    for (const u of pessoas) if (u.fluxo_id && ativos.has(u.fluxo_id)) conta.set(u.fluxo_id, (conta.get(u.fluxo_id) ?? 0) + 1);
    return [...conta.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  };
  const c = normalizar(cargo.trim());
  const pessoas = (lista ?? []).filter((u) => u.ativo);
  return (c && maisUsado(pessoas.filter((u) => normalizar(u.cargo ?? '') === c)))
    || maisUsado(pessoas.filter((u) => u.papel === papel)) || null;
}

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
  const [fFluxo, setFFluxo] = useState('');
  const [fluxos, setFluxos] = useState<FluxoResumo[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [fluxoLote, setFluxoLote] = useState('');
  const [novo, setNovo] = useState<NovoUsuario | null>(null);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [senha, setSenha] = useState<{ id: string; valor: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.from('perfis').select('id, nome, matricula, email, cargo, papel, fluxo_id, unidade_id, ativo, deve_trocar_senha, ultimo_acesso_em, unidade:unidades!perfis_unidade_id_fkey(nome)').order('nome'),
      supabase.from('unidades').select('id, nome, ativa').order('nome'),
      supabase.from('supervisao').select('supervisor_id, unidade_id'),
      supabase.from('fluxos').select('id, nome, ativo').order('nome'),
    ]).then(([p, u, sv, fl]) => {
      if (!vivo) return;
      const vinculos = (sv.data as { supervisor_id: string; unidade_id: string }[]) ?? [];
      const ordenada = ((p.data as unknown as Usuario[]) ?? [])
        .map((x) => ({ ...x, supervisiona: vinculos.filter((v) => v.supervisor_id === x.id).map((v) => v.unidade_id) }))
        .sort((a, b) => ORDEM_PAPEL.indexOf(a.papel) - ORDEM_PAPEL.indexOf(b.papel) || a.nome.localeCompare(b.nome, 'pt-BR'));
      setLista(ordenada);
      setUnidades((u.data as Unidade[]) ?? []);
      setFluxos((fl.data as FluxoResumo[]) ?? []);
      setErro(p.error ? mensagemErro(p.error) : null);
    });
    return () => {
      vivo = false;
    };
  }, [supabase, versao]);

  const totais = useMemo(() => {
    const l = lista ?? [];
    return {
      todos: l.length, funcionario: l.filter((u) => u.papel === 'funcionario').length,
      chefias: l.filter((u) => CHEFIAS.includes(u.papel)).length, gestao: l.filter((u) => GESTAO.includes(u.papel)).length, ativos: l.filter((u) => u.ativo).length, inativos: l.filter((u) => !u.ativo).length,
    } as Record<Filtro, number>;
  }, [lista]);

  const visiveis = useMemo(() => {
    const t = normalizar(busca);
    return (lista ?? []).filter((u) =>
      (filtro === 'todos' || (filtro === 'ativos' ? u.ativo : filtro === 'inativos' ? !u.ativo
        : filtro === 'chefias' ? CHEFIAS.includes(u.papel) : filtro === 'gestao' ? GESTAO.includes(u.papel) : u.papel === filtro))
      && (!fUnidade || u.unidade_id === fUnidade || u.supervisiona.includes(fUnidade))
      && (!fFluxo || (fFluxo === 'sem' ? !u.fluxo_id : u.fluxo_id === fFluxo))
      && (!t || normalizar(`${u.nome} ${u.matricula} ${u.cargo} ${u.unidade?.nome}`).includes(t)));
  }, [lista, busca, filtro, fUnidade, fFluxo]);
  const nomeFluxo = (id: string | null) => fluxos.find((f) => f.id === id)?.nome;
  const pag = usePaginacao(visiveis, 25);

  function alternarMarca(id: string) {
    setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const todosMarcados = visiveis.length > 0 && visiveis.every((u) => marcados.has(u.id));

  /** Aplica o mesmo fluxo de assinatura a todos os marcados */
  async function aplicarLote() {
    const ids = [...marcados];
    if (!ids.length) return;
    if (!fluxoLote) return setErro('Escolha o fluxo de assinatura que vai valer para os marcados.');
    setOcupado('lote');
    let erroLote: string | null = null;
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from('perfis').update({ fluxo_id: fluxoLote === 'sem' ? null : fluxoLote }).in('id', ids.slice(i, i + 200));
      if (error) { erroLote = mensagemErro(error); break; }
    }
    setOcupado(null);
    if (erroLote) return setErro(erroLote);
    const nome = fluxoLote === 'sem' ? 'sem fluxo (só a Direção)' : nomeFluxo(fluxoLote);
    setMarcados(new Set());
    setFluxoLote('');
    concluir(`Fluxo "${nome}" aplicado a ${ids.length} ${ids.length === 1 ? 'pessoa' : 'pessoas'}. Os pedidos que ainda aguardam assinatura passam a seguir o fluxo novo (as assinaturas já feitas continuam valendo).`);
  }

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
    if (!SEM_UNIDADE.includes(novo.papel) && !novo.unidade_id) return setErro('Escolha a unidade.');
    if (novo.papel === 'supervisor' && !novo.supervisiona.length) return setErro('Marque as unidades que o Supervisor acompanha.');
    setOcupado('novo');
    const r = await criarUsuario(novo);
    const vincular = COM_VINCULOS.includes(novo.papel) ? novo.supervisiona.filter((u) => u !== novo.unidade_id) : [];
    if (!r.erro && r.id && vincular.length) {
      const { error } = await supabase.from('supervisao').insert(vincular.map((u) => ({ supervisor_id: r.id, unidade_id: u })));
      if (error) { setOcupado(null); return setErro(`Acesso criado, mas as unidades do Supervisor não foram salvas: ${mensagemErro(error)}`); }
    }
    setOcupado(null);
    if (r.erro) return setErro(r.erro);
    setNovo(null);
    concluir(`Acesso criado para ${novo.nome}. Passe a matrícula ${novo.matricula.trim()} e a senha inicial ${novo.senha}. No primeiro acesso a pessoa cria a senha dela.`);
  }

  async function salvarEdicao() {
    if (!editando) return;
    const antes = lista?.find((u) => u.id === editando.id);
    if (!SEM_UNIDADE.includes(editando.papel) && !editando.unidade_id) return setErro('Escolha a unidade.');
    if (editando.papel === 'supervisor' && !editando.supervisiona.length) return setErro('Marque as unidades que o Supervisor acompanha.');
    if (!matriculaValida(editando.matricula)) return setErro('Matrícula inválida.');
    setOcupado(editando.id);
    if (antes && antes.matricula !== editando.matricula.trim()) {
      const r = await mudarMatricula(editando.id, editando.matricula);
      if (r.erro) { setOcupado(null); return setErro(r.erro); }
    }
    const { error } = await supabase.from('perfis').update({
      nome: editando.nome.trim(), cargo: editando.cargo?.trim() || null, papel: editando.papel, fluxo_id: editando.fluxo_id,
      unidade_id: editando.papel === 'direcao' || editando.papel === 'coordenacao' ? null : editando.unidade_id,
    }).eq('id', editando.id);
    if (error) { setOcupado(null); return setErro(mensagemErro(error)); }
    // Unidades acompanhadas pelo Supervisor
    const novas = COM_VINCULOS.includes(editando.papel) ? editando.supervisiona.filter((u) => u !== editando.unidade_id) : [];
    const tirar = (antes?.supervisiona ?? []).filter((u) => !novas.includes(u));
    const por = novas.filter((u) => !(antes?.supervisiona ?? []).includes(u));
    const r1 = tirar.length ? await supabase.from('supervisao').delete().eq('supervisor_id', editando.id).in('unidade_id', tirar) : { error: null };
    const r2 = por.length ? await supabase.from('supervisao').insert(por.map((u) => ({ supervisor_id: editando.id, unidade_id: u }))) : { error: null };
    setOcupado(null);
    if (r1.error || r2.error) return setErro(mensagemErro(r1.error ?? r2.error));
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
  const opcoesPapel = ORDEM_PAPEL.slice().reverse().map((p) => ({ valor: p, rotulo: PAPEIS[p].rotulo, detalhe: PAPEIS[p].descricao }));
  const opcoesFluxo = fluxos.filter((f) => f.ativo).map((f) => ({ valor: f.id, rotulo: f.nome }));
  const FILTROS: [Filtro, string][] = [
    ['todos', 'Todos'], ['funcionario', 'Funcionários'], ['chefias', 'Chefias'], ['gestao', 'Gestão e RH'], ['ativos', 'Ativos'], ['inativos', 'Inativos'],
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
          <button type="button" onClick={() => { setNovo({ ...NOVO, senha: gerarSenhaTemporaria(), fluxo_id: sugerirFluxo(lista, fluxos, '', 'funcionario') }); limpar(); }} className="dock-btn-primary text-xs font-semibold">
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
          <Escolha valor={fUnidade} onChange={setFUnidade} vazio="Todas as unidades" rotulo="Filtrar por unidade" compacto className="sm:w-56"
            opcoes={unidades.map((u) => ({ valor: u.id, rotulo: u.nome }))} />
          <Escolha valor={fFluxo} onChange={setFFluxo} vazio="Todos os fluxos" rotulo="Filtrar por fluxo de assinatura" compacto className="sm:w-64"
            opcoes={[...fluxos.map((f) => ({ valor: f.id, rotulo: f.nome, detalhe: f.ativo ? undefined : 'desativado' })),
              { valor: 'sem', rotulo: 'Sem fluxo (só a Direção)' }]} />
          <CampoBusca valor={busca} onChange={setBusca} placeholder="Nome, matrícula ou cargo" className="w-full sm:w-72" />
        </div>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tom="info">{ok}</Aviso>}

      {lista && visiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button"
            onClick={() => setMarcados((m) => {
              const n = new Set(m);
              if (todosMarcados) visiveis.forEach((u) => n.delete(u.id)); else visiveis.forEach((u) => n.add(u.id));
              return n;
            })}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-electric-cobalt/30 bg-white px-4 text-xs font-semibold text-electric-cobalt hover:bg-lavender-mist">
            <CheckCheck className="size-4" aria-hidden />
            {todosMarcados ? 'Desmarcar os filtrados' : `Marcar os ${visiveis.length} filtrados`}
          </button>
          <span className="text-xs text-tinta-suave">Marque várias pessoas para aplicar o mesmo fluxo de assinatura de uma vez. Use os filtros para achar o grupo.</span>
        </div>
      )}

      <Janela aberta={!!novo} onFechar={() => { setNovo(null); setErro(null); }} titulo="Novo usuário"
        subtitulo="A senha inicial é temporária: a pessoa troca no primeiro acesso"
        rodape={<>
          <Botao variante="discreto" onClick={() => { setNovo(null); setErro(null); }}>Cancelar</Botao>
          <Botao carregando={ocupado === 'novo'} onClick={salvarNovo}>Criar acesso</Botao>
        </>}>
        {novo && (
          <>
            {erro && <div className="mb-3"><Aviso>{erro}</Aviso></div>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <Campo rotulo="Cargo"><input list="cargos" value={novo.cargo} maxLength={120} className={inputCls}
              onChange={(e) => setNovo({ ...novo, cargo: e.target.value, fluxo_id: sugerirFluxo(lista, fluxos, e.target.value, novo.papel) })} /></Campo>
            <Campo rotulo="Tipo de acesso" dica={PAPEIS[novo.papel].descricao}>
              <Escolha valor={novo.papel} rotulo="Tipo de acesso" opcoes={opcoesPapel}
                onChange={(v) => { const papel = v as Papel; setNovo({ ...novo, papel, fluxo_id: sugerirFluxo(lista, fluxos, novo.cargo, papel) }); }} />
            </Campo>
            <Campo rotulo="Quem assina os pedidos dele(a)" dica="Fluxo de assinatura. Dá para mudar depois, inclusive de vários de uma vez.">
              <Escolha valor={novo.fluxo_id ?? ''} onChange={(v) => setNovo({ ...novo, fluxo_id: v || null })} rotulo="Fluxo de assinatura"
                vazio="Sem fluxo (só a Direção)" opcoes={opcoesFluxo} />
            </Campo>
            {novo.papel !== 'direcao' && novo.papel !== 'coordenacao' && (
              <Campo rotulo={SEM_UNIDADE.includes(novo.papel) ? 'Lotação (opcional)' : 'Unidade *'}>
                <Escolha valor={novo.unidade_id ?? ''} onChange={(v) => setNovo({ ...novo, unidade_id: v || null })} rotulo="Unidade"
                  placeholder="Digite o nome da unidade" vazio={SEM_UNIDADE.includes(novo.papel) ? 'Sede' : undefined}
                  opcoes={unidadesAtivas.map((x) => ({ valor: x.id, rotulo: x.nome }))} />
              </Campo>
            )}
            {COM_VINCULOS.includes(novo.papel) && (
              <UnidadesSupervisor papel={novo.papel} lotacao={novo.unidade_id} unidades={unidadesAtivas} marcadas={novo.supervisiona} onChange={(v) => setNovo({ ...novo, supervisiona: v })} />
            )}
          </div>
          </>
        )}
      </Janela>

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
                <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
                  <label className="-m-2 flex shrink-0 cursor-pointer items-center p-2" title="Marcar para mudar o fluxo de vários">
                    <input type="checkbox" checked={marcados.has(u.id)} onChange={() => alternarMarca(u.id)}
                      aria-label={`Marcar ${u.nome}`} className="size-5 accent-electric-cobalt" />
                  </label>
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
                      <span className="inline-flex items-center gap-1"><GitBranch className="size-3" aria-hidden />
                        Fluxo: {nomeFluxo(u.fluxo_id) ?? 'só a Direção'}
                      </span>
                      <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden />
                        {u.ultimo_acesso_em ? `Último acesso: ${dataHoraBR(u.ultimo_acesso_em)}` : 'Nunca entrou'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-electric-cobalt/20 bg-powder-blue/25 px-3 py-0.5 text-[11px] font-semibold text-electric-cobalt">
                        <MapPin className="size-3" aria-hidden /> Lotação: {u.unidade?.nome ?? (SEM_UNIDADE.includes(u.papel) ? 'Sede' : 'Não vinculada')}
                      </span>
                      {(u.papel === 'supervisor' || u.supervisiona.length > 0) && (
                        <span className="text-[11px] font-semibold text-violet-700">
                          {u.papel === 'supervisor' ? 'Supervisiona' : 'Também chefia em'}: {u.supervisiona.length ? u.supervisiona.map((id) => unidades.find((x) => x.id === id)?.nome).filter(Boolean).join(', ') : 'nenhuma unidade'}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-gray">
                        <span className={`size-2 rounded-full ${u.ativo ? 'bg-forest' : 'bg-steel-gray'}`} aria-hidden /> {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    {ed && (
                      <div className="mt-3 space-y-3 rounded-xl border border-electric-cobalt/30 bg-powder-blue/15 p-3.5">
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                          <Campo rotulo="Nome"><input value={ed.nome} maxLength={150} onChange={(e) => setEditando({ ...ed, nome: e.target.value })} className={inputCls} /></Campo>
                          <Campo rotulo="Matrícula"><input value={ed.matricula} maxLength={40} onChange={(e) => setEditando({ ...ed, matricula: e.target.value })} className={inputCls} /></Campo>
                          <Campo rotulo="Cargo"><input list="cargos" value={ed.cargo ?? ''} maxLength={120} onChange={(e) => setEditando({ ...ed, cargo: e.target.value })} className={inputCls} /></Campo>
                          <Campo rotulo="Acesso">
                            <Escolha valor={ed.papel} desabilitado={u.id === meuId} rotulo="Acesso" opcoes={opcoesPapel}
                              onChange={(v) => setEditando({ ...ed, papel: v as Papel })} />
                          </Campo>
                          <Campo rotulo="Quem assina os pedidos">
                            <Escolha valor={ed.fluxo_id ?? ''} onChange={(v) => setEditando({ ...ed, fluxo_id: v || null })} rotulo="Fluxo de assinatura"
                              vazio="Sem fluxo (só a Direção)" opcoes={opcoesFluxo} />
                          </Campo>
                          {ed.papel !== 'direcao' && ed.papel !== 'coordenacao' && (
                            <Campo rotulo={SEM_UNIDADE.includes(ed.papel) ? 'Lotação' : 'Unidade'}>
                              <Escolha valor={ed.unidade_id ?? ''} onChange={(v) => setEditando({ ...ed, unidade_id: v || null })} rotulo="Unidade"
                                placeholder="Digite o nome da unidade" vazio={SEM_UNIDADE.includes(ed.papel) ? 'Sede' : undefined}
                                opcoes={unidadesAtivas.map((x) => ({ valor: x.id, rotulo: x.nome }))} />
                            </Campo>
                          )}
                        </div>
                        {COM_VINCULOS.includes(ed.papel) && (
                          <UnidadesSupervisor papel={ed.papel} lotacao={ed.unidade_id} unidades={unidadesAtivas} marcadas={ed.supervisiona} onChange={(v) => setEditando({ ...ed, supervisiona: v })} />
                        )}
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

      {marcados.size > 0 && <div className="h-40 lg:h-24" aria-hidden />}
      {marcados.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2 lg:bottom-4 lg:left-72 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-2xl border border-electric-cobalt/30 bg-white p-3 shadow-xl sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-ink-charcoal">
                {marcados.size} {marcados.size === 1 ? 'pessoa marcada' : 'pessoas marcadas'}
              </p>
              <button type="button" onClick={() => setMarcados(new Set())} aria-label="Desmarcar todos"
                className="inline-flex size-9 items-center justify-center rounded-full text-slate-gray hover:bg-faint-gray">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Escolha valor={fluxoLote} onChange={setFluxoLote} rotulo="Fluxo para os marcados" placeholder="Escolha o fluxo de assinatura"
                className="flex-1" opcoes={[...opcoesFluxo, { valor: 'sem', rotulo: 'Sem fluxo (só a Direção)' }]} />
              <Botao carregando={ocupado === 'lote'} onClick={aplicarLote}>
                <GitBranch className="size-4" aria-hidden /> Aplicar a {marcados.size}
              </Botao>
            </div>
          </div>
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

/** Unidades que o Supervisor acompanha (ele assina no lugar das chefias ausentes delas) */
function UnidadesSupervisor({ papel, lotacao, unidades, marcadas, onChange }: {
  papel: Papel; lotacao: string | null; unidades: Unidade[]; marcadas: string[]; onChange: (v: string[]) => void;
}) {
  const supervisor = papel === 'supervisor';
  return (
    <fieldset className="col-span-full rounded-xl border border-violet-200 bg-violet-50/50 p-3">
      <legend className="px-1 text-xs font-semibold text-violet-700">
        {supervisor ? 'Unidades que acompanha *' : 'Outras unidades em que também é chefia (opcional)'}
      </legend>
      {!supervisor && (
        <p className="mb-2 text-[11px] text-slate-gray">Marque se esta pessoa assina os pedidos de mais de uma unidade. A lotação já está incluída.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {unidades.filter((x) => supervisor || x.id !== lotacao).map((x) => {
          const on = marcadas.includes(x.id);
          return (
            <label key={x.id} className={`inline-flex min-h-[36px] cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
              on ? 'border-violet-400 bg-white text-violet-800' : 'border-linha bg-white text-slate-gray'}`}>
              <input type="checkbox" checked={on} className="size-3.5 accent-violet-600"
                onChange={() => onChange(on ? marcadas.filter((m) => m !== x.id) : [...marcadas, x.id])} />
              {x.nome}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
