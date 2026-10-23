'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link, { useLinkStatus } from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Building2, CheckCircle2, Loader2, LogOut, Menu, Search, ShieldCheck, WifiOff, X } from 'lucide-react';
import { definirDonoCache } from '@/lib/cacheTela';
import { createClient } from '@/lib/supabase/client';
import { sairDoSistema, usePerfil } from '@/lib/contextoPerfil';
import { rotasDo } from '@/lib/rotas';
import { PAPEIS, type Perfil } from '@/lib/types';

export const iniciais = (nome: string) => {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return 'US';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
};

export default function Shell({ perfil, children }: { perfil: Perfil; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { minutosInatividade } = usePerfil();
  const supabase = useMemo(() => createClient(), []);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [online, setOnline] = useState(true);
  const [avisosAbertos, setAvisosAbertos] = useState(false);
  const [pendentes, setPendentes] = useState<Record<string, number>>({});
  const [recontar, setRecontar] = useState(0);
  const areaAvisos = useRef<HTMLDivElement>(null);

  const itens = rotasDo(perfil.papel);
  const local = perfil.papel === 'direcao' ? 'Sede' : perfil.unidade?.nome ?? 'Unidade';
  const direcao = perfil.papel === 'direcao';

  definirDonoCache(perfil.id);

  // Situação da conexão
  useEffect(() => {
    setOnline(navigator.onLine);
    const ligar = () => setOnline(true);
    const desligar = () => setOnline(false);
    window.addEventListener('online', ligar);
    window.addEventListener('offline', desligar);
    return () => {
      window.removeEventListener('online', ligar);
      window.removeEventListener('offline', desligar);
    };
  }, []);

  // Recontagem pedida pelas telas depois de aprovar/negar
  useEffect(() => {
    const f = () => setRecontar((v) => v + 1);
    window.addEventListener('siger:pendencias', f);
    return () => window.removeEventListener('siger:pendencias', f);
  }, []);

  // O que está esperando por você (menu e sino)
  useEffect(() => {
    let vivo = true;
    async function contar() {
      const novo: Record<string, number> = {};
      const conta = () => supabase.from('solicitacoes').select('id', { count: 'exact', head: true });
      if (perfil.papel === 'chefia') {
        const { count } = await conta().eq('situacao', 'Aguardando chefia').eq('unidade_id', perfil.unidade_id!).neq('solicitante_id', perfil.id);
        novo['/aprovacoes'] = count ?? 0;
      }
      if (perfil.papel === 'direcao') {
        const { count } = await conta().eq('situacao', 'Aguardando direção').neq('solicitante_id', perfil.id);
        novo['/decisoes'] = count ?? 0;
      }
      if (vivo) setPendentes(novo);
    }
    contar();
    const t = setInterval(contar, 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [supabase, perfil, pathname, recontar]);

  // Fecha o painel do sino ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!avisosAbertos) return;
    const fora = (e: MouseEvent) => {
      if (areaAvisos.current && !areaAvisos.current.contains(e.target as Node)) setAvisosAbertos(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAvisosAbertos(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [avisosAbertos]);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = busca.trim().slice(0, 80);
    const destino = direcao ? '/todas' : perfil.papel === 'chefia' ? '/aprovacoes' : '/minhas';
    router.push(q ? `${destino}?q=${encodeURIComponent(q)}` : destino);
  }

  const totalPendentes = Object.values(pendentes).reduce((a, b) => a + b, 0);
  const itensMobile = itens.filter((r) => r.path !== '/conta').slice(0, 4);

  return (
    <div className="min-h-dvh bg-papel lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Barra superior no celular */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-electric-cobalt px-4 text-white shadow-md lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/emblema-fspss.png" alt="" width={44} height={56} className="h-10 w-auto rounded-md object-contain" priority />
          <div className="min-w-0">
            <span className="block text-sm font-extrabold tracking-tight text-white">SIGER RH</span>
            <span className="block truncate text-[11px] font-medium text-powder-blue">{local}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls="menu-lateral"
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20"
        >
          {aberto ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </header>

      {aberto && (
        <div role="presentation" onClick={() => setAberto(false)} className="fixed inset-0 z-40 bg-ink-charcoal/50 backdrop-blur-xs lg:hidden" />
      )}

      {/* Menu lateral */}
      <aside
        id="menu-lateral"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/15 bg-electric-cobalt text-white transition-transform duration-200 ease-in-out
          lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0 ${aberto ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:shadow-none'}`}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-5 lg:justify-center">
          <Link href="/inicio" className="flex items-center justify-center" onClick={() => setAberto(false)}>
            <Image src="/logo-siger-rh.png" alt="SIGER RH" width={640} height={310} className="h-16 w-auto object-contain drop-shadow-sm" priority />
          </Link>
          <button type="button" onClick={() => setAberto(false)} aria-label="Fechar menu"
            className="flex size-10 items-center justify-center self-start rounded-xl bg-white/10 text-white hover:bg-white/20 lg:hidden">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3.5 py-3" aria-label="Menu principal">
          <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-powder-blue/70">Módulos</p>
          <ul className="space-y-1">
            {itens.map(({ path, titulo, icone: Icone, grupo }) => {
              const ativo = pathname === path || pathname.startsWith(path + '/');
              const n = pendentes[path] ?? 0;
              return (
                <li key={path}>
                  {grupo && <p className="px-3 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-wider text-powder-blue/70">{grupo}</p>}
                  <Link
                    href={path}
                    onClick={() => setAberto(false)}
                    aria-current={ativo ? 'page' : undefined}
                    className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all ${
                      ativo ? 'bg-white font-bold text-electric-cobalt shadow-md' : 'font-medium text-white/85 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icone className={`size-4.5 shrink-0 ${ativo ? 'text-electric-cobalt' : 'text-powder-blue'}`} aria-hidden />
                    <span className="flex-1 truncate">{titulo}</span>
                    {n > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ativo ? 'bg-electric-cobalt text-white' : 'bg-white text-electric-cobalt'}`}
                        aria-label={`${n} aguardando`}>
                        {n}
                      </span>
                    )}
                    <IndicadorClique ativo={ativo} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-2 border-t border-white/15 bg-electric-cobalt p-3.5">
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/90 shadow-xs"
            title={`A sessão encerra sozinha depois de ${minutosInatividade} minutos sem uso`}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-powder-blue" aria-hidden />
              <span className="text-[11px] font-medium text-white/90">Sessão protegida</span>
            </div>
            <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-powder-blue">{minutosInatividade} min</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white shadow-xs">
            <Building2 className="size-3.5 shrink-0 text-powder-blue" aria-hidden />
            <span className="truncate text-[11px] font-bold">{PAPEIS[perfil.papel].rotulo} | {local}</span>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Link href="/conta" onClick={() => setAberto(false)} title="Minha conta"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-electric-cobalt shadow-xs">
              {iniciais(perfil.nome)}
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">{perfil.nome}</p>
              <p className="truncate text-[11px] text-powder-blue">Matrícula: {perfil.matricula}</p>
            </div>
            <button type="button" onClick={() => sairDoSistema()} aria-label="Sair do sistema" title="Sair do sistema"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-powder-blue transition-colors hover:bg-white/10 hover:text-white">
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Barra superior desktop */}
        <header className="sticky top-0 z-20 hidden h-16 items-center justify-between border-b border-white/15 bg-electric-cobalt px-8 text-white shadow-md lg:flex">
          <form role="search" onSubmit={buscar}
            className="flex w-80 items-center gap-2.5 rounded-full border border-white/20 bg-white/15 px-4 py-2 text-xs backdrop-blur-xs transition-all focus-within:border-white focus-within:bg-white/25 xl:w-96">
            <button type="submit" aria-label="Buscar" className="shrink-0 text-white/80 hover:text-white">
              <Search className="size-4" />
            </button>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} maxLength={80}
              placeholder={direcao ? 'Buscar por nome, matrícula ou protocolo' : perfil.papel === 'chefia' ? 'Buscar pedido da equipe' : 'Buscar nos meus pedidos'}
              aria-label="Buscar" className="w-full bg-transparent text-xs text-white placeholder-white/70 outline-none" />
          </form>

          <div className="flex items-center gap-3.5">
            {online ? (
              <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs">
                <CheckCircle2 className="size-3.5 text-emerald-400" aria-hidden />
                <span>Conectado</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-full border border-white/30 bg-danger/90 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs">
                <WifiOff className="size-3.5" aria-hidden />
                <span>Sem conexão</span>
              </div>
            )}

            {perfil.papel !== 'funcionario' && (
              <div className="relative" ref={areaAvisos}>
                <button type="button" title="Notificações" aria-expanded={avisosAbertos}
                  aria-label={totalPendentes > 0 ? `Notificações: ${totalPendentes} aguardando` : 'Notificações'}
                  onClick={() => setAvisosAbertos((v) => !v)}
                  className="flex size-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-xs transition-colors hover:bg-white/20">
                  <Bell className="size-4" />
                </button>
                {totalPendentes > 0 && (
                  <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white shadow-xs">
                    {totalPendentes}
                  </span>
                )}
                {avisosAbertos && (
                  <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-linha bg-white p-2 text-ink-charcoal shadow-xl">
                    <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-gray">Notificações</p>
                    {totalPendentes === 0 ? (
                      <p className="px-3 pb-3 pt-1 text-xs text-slate-gray">Nada aguardando a sua análise.</p>
                    ) : (
                      <ul>
                        {Object.entries(pendentes).filter(([, n]) => n > 0).map(([rota, n]) => (
                          <li key={rota}>
                            <Link href={rota} onClick={() => setAvisosAbertos(false)} className="block rounded-xl px-3 py-2 text-xs hover:bg-faint-gray">
                              <strong>{n}</strong> {n === 1 ? 'pedido aguarda' : 'pedidos aguardam'} {rota === '/decisoes' ? 'a decisão da Direção' : 'a sua análise'}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="ml-1 flex items-center rounded-xl border border-white/25 bg-white px-3 py-1.5 shadow-xs">
              <Image src="/header-brasoes.png" alt="SESAU, FSPSS e Governo Municipal de São Sebastião" width={640} height={132} className="h-6 w-auto object-contain" priority />
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8">{children}</main>

        {/* Navegação inferior no celular (zona do polegar) */}
        <nav aria-label="Navegação rápida"
          className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-linha bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur-md lg:hidden">
          {itensMobile.map(({ path, titulo, curto, icone: Icone }) => {
            const ativo = pathname === path || pathname.startsWith(path + '/');
            const n = pendentes[path] ?? 0;
            return (
              <Link key={path} href={path} aria-current={ativo ? 'page' : undefined}
                className={`relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  ativo ? 'font-semibold text-electric-cobalt' : 'text-slate-gray hover:text-ink-charcoal'}`}>
                <Icone className="size-5" aria-hidden />
                <span className="max-w-[4.5rem] truncate">{curto ?? titulo}</span>
                {n > 0 && <span className="absolute right-1 top-0 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{n}</span>}
              </Link>
            );
          })}
          <button type="button" onClick={() => setAberto(true)}
            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-gray hover:text-ink-charcoal">
            <Menu className="size-5" aria-hidden />
            <span>Mais</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

/** Rodinha no item do menu clicado enquanto a tela abre */
function IndicadorClique({ ativo }: { ativo: boolean }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className={`size-3.5 shrink-0 animate-spin ${ativo ? 'text-electric-cobalt' : 'text-white'}`} aria-label="Abrindo" /> : null;
}
