'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { limparCacheTelas } from '@/lib/cacheTela';
import { descobrirEtapa, limparIdas, marcarAtividade, ultimaAtividade } from '@/lib/acesso';
import type { Papel, Perfil } from '@/lib/types';

type Contexto = { perfil: Perfil; minutosInatividade: number; recarregar: () => Promise<void> };

const PerfilContext = createContext<Contexto | null>(null);

export function usePerfil(): Contexto {
  const ctx = useContext(PerfilContext);
  if (!ctx) throw new Error('usePerfil deve ser usado dentro de ProvedorPerfil');
  return ctx;
}

/** Apaga do navegador tudo o que guarda a sessão do Supabase (cookies sb-* e chaves sb- do armazenamento) */
export function apagarSessaoLocal() {
  const nomes = document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => n.startsWith('sb-'));
  const extras = ['', '; SameSite=Lax', '; SameSite=None; Secure', '; SameSite=None; Secure; Partitioned'];
  for (const nome of nomes) {
    for (const e of extras) document.cookie = `${nome}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${e}`;
  }
  for (const area of [localStorage, sessionStorage]) {
    try {
      Object.keys(area).filter((k) => k.startsWith('sb-')).forEach((k) => area.removeItem(k));
    } catch { /* sem armazenamento */ }
  }
}

/** Sai do sistema e volta para a tela de entrada (com um motivo opcional).
 *  Nunca fica preso: se o Supabase demorar a responder, a sessão é apagada aqui mesmo. */
let saindo = false;
export async function sairDoSistema(motivo?: 'inatividade' | 'bloqueado', todosAparelhos = false) {
  if (saindo) return;
  saindo = true;
  limparCacheTelas();
  try { sessionStorage.setItem('siger-rh:saiu', '1'); } catch { /* sem armazenamento */ }
  try {
    await Promise.race([
      createClient().auth.signOut({ scope: todosAparelhos ? 'global' : 'local' }),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* já saiu */ }
  apagarSessaoLocal();
  window.location.replace(`/login${motivo ? `?motivo=${motivo}` : ''}`);
}

/**
 * Libera as telas só para quem passou por todas as etapas (senha, duas etapas, troca da senha inicial).
 * Isto é conveniência de navegação: quem decide o que cada um vê é o banco (RLS).
 */
export function ProvedorPerfil({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [minutos, setMinutos] = useState(30);
  const [falha, setFalha] = useState<string | null>(null);
  const verificando = useRef(false);

  const carregar = useCallback(async () => {
    if (verificando.current) return;
    verificando.current = true;
    setFalha(null);
    try {
      const supabase = createClient();
      const { etapa, seg, motivo } = await descobrirEtapa(supabase);
      if (etapa === 'bloqueado') return void setFalha(motivo ?? 'Acesso não liberado.');
      if (etapa !== 'liberado' || !seg) return void router.replace('/login');

      let p = seg.perfil ?? null;
      if (!p) {
        // banco ainda sem o script 005: busca o perfil do jeito antigo
        const { data: { session } } = await supabase.auth.getSession();
        const { data, error } = await supabase
          .from('perfis')
          .select('id, nome, matricula, email, cargo, papel, unidade_id, ativo, unidade:unidades!perfis_unidade_id_fkey(nome, sigla)')
          .eq('id', session!.user.id)
          .maybeSingle();
        if (error || !data) {
          return void setFalha(`Não foi possível ler o seu perfil${error ? ` (${error.message})` : ''}. Rode o script 005_correcao_acesso.sql no Supabase.`);
        }
        p = data as unknown as Perfil;
      }
      limparIdas();
      setMinutos(seg.minutos_inatividade || 30);
      setPerfil(p);
    } catch (e) {
      setFalha(`Não foi possível verificar o acesso (${e instanceof Error ? e.message : String(e)}).`);
    } finally {
      verificando.current = false;
    }
  }, [router]);

  useEffect(() => {
    marcarAtividade();
    carregar();
    // Se a sessão acabar em outra aba (saiu, senha trocada, acesso desativado), sai aqui também
    const { data: escuta } = createClient().auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') sairDoSistema();
    });
    return () => escuta.subscription.unsubscribe();
  }, [carregar]);

  // Saída automática por inatividade + nova checagem do acesso a cada 5 minutos
  useEffect(() => {
    if (!perfil) return;
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    let ultimoRegistro = 0;
    const atividade = () => {
      const agora = Date.now();
      if (agora - ultimoRegistro > 15_000) { ultimoRegistro = agora; marcarAtividade(); }
    };
    eventos.forEach((e) => window.addEventListener(e, atividade, { passive: true }));
    const relogio = setInterval(() => {
      if (Date.now() - ultimaAtividade() > minutos * 60_000) sairDoSistema('inatividade');
    }, 20_000);
    const checagem = setInterval(async () => {
      const { etapa } = await descobrirEtapa(createClient());
      if (etapa !== 'liberado') sairDoSistema(etapa === 'bloqueado' ? 'bloqueado' : undefined);
    }, 5 * 60_000);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, atividade));
      clearInterval(relogio);
      clearInterval(checagem);
    };
  }, [perfil, minutos]);

  if (falha) return <TelaFalha motivo={falha} onTentar={carregar} />;
  if (!perfil) return <TelaCarregando />;

  return (
    <PerfilContext.Provider value={{ perfil, minutosInatividade: minutos, recarregar: carregar }}>
      {children}
    </PerfilContext.Provider>
  );
}

/** Em vez de ficar indo e voltando entre telas, mostra o motivo e deixa a pessoa decidir */
export function TelaFalha({ motivo, onTentar }: { motivo: string; onTentar?: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-papel p-4">
      <div className="dock-card w-full max-w-md p-6 text-center sm:p-8">
        <Image src="/logo.png" alt="SIGER RH" width={64} height={64} className="mx-auto size-14 rounded-xl object-contain" />
        <h1 className="mt-4 text-lg font-bold text-ink-charcoal">Não foi possível abrir o sistema</h1>
        <p role="alert" className="mt-3 rounded-xl border border-danger/20 bg-danger-light px-4 py-3 text-left text-sm text-danger">{motivo}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onTentar && <button type="button" onClick={onTentar} className="dock-btn-ghost">Tentar de novo</button>}
          <button type="button" onClick={() => sairDoSistema()} className="dock-btn-primary">Sair</button>
        </div>
      </div>
    </div>
  );
}

export function TelaCarregando() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-papel p-4">
      <div className="dock-card flex flex-col items-center gap-4 p-6">
        <Image src="/logo.png" alt="SIGER RH" width={80} height={80} className="size-16 rounded-xl object-contain" priority />
        <div className="flex items-center gap-2 text-xs font-semibold text-electric-cobalt">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span>Carregando ambiente seguro</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-gray">
          <ShieldCheck className="size-3.5" aria-hidden /> Conexão protegida
        </span>
      </div>
    </div>
  );
}

/** Mostra a tela só para os papéis indicados (o banco também bloqueia os dados) */
export function Exige({ papeis, children }: { papeis: Papel[]; children: React.ReactNode }) {
  const { perfil } = usePerfil();
  const router = useRouter();
  const pode = papeis.includes(perfil.papel);
  useEffect(() => {
    if (!pode) router.replace('/inicio');
  }, [pode, router]);
  return pode ? <>{children}</> : null;
}
