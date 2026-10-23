'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, Loader2, LockKeyhole, LogOut, ShieldCheck, Smartphone, UserCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { emailDaMatricula } from '@/lib/login';
import {
  descobrirEtapa, idaAoInicioRepetida, iniciarCadastroMfa, marcarAtividade, problemaSenha, registrarFalha, segundosBloqueado, zerarFalhas, type Etapa,
} from '@/lib/acesso';
import { apagarSessaoLocal, sairDoSistema } from '@/lib/contextoPerfil';

const PASSOS = [
  ['Funcionário', 'pede o ajuste de ponto ou a folga, com o comprovante.'],
  ['Chefia da unidade', 'analisa os pedidos da equipe.'],
  ['Direção', 'dá a decisão final das folgas.'],
] as const;

const campo =
  'w-full min-h-[44px] rounded-xl border border-linha bg-white px-3.5 py-2.5 text-sm text-ink-charcoal outline-none transition-all ' +
  'focus:border-electric-cobalt focus:ring-2 focus:ring-electric-cobalt/20';
const botao =
  'mt-6 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-electric-cobalt px-5 py-2.5 text-sm font-semibold ' +
  'text-white shadow-xs transition-all hover:bg-deep-cobalt active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

export default function LoginForm() {
  const router = useRouter();
  const motivo = useSearchParams().get('motivo');
  const supabase = useMemo(() => createClient(), []);
  const [etapa, setEtapa] = useState<Etapa | null>(null);
  const [matriculaSessao, setMatriculaSessao] = useState<string | null>(null);

  const [motivoBloqueio, setMotivoBloqueio] = useState<string | null>(null);

  const avancar = useCallback(async () => {
    const { etapa: e, motivo: m } = await descobrirEtapa(supabase);
    if (e === 'liberado') {
      if (idaAoInicioRepetida()) {
        setMotivoBloqueio('O sistema entrou em repetição ao abrir. Saia, entre de novo e, se continuar, rode o script 005_correcao_acesso.sql no Supabase.');
        setEtapa('bloqueado');
        return;
      }
      marcarAtividade();
      router.replace('/inicio');
      return;
    }
    if (e !== 'entrar') {
      const { data: { session } } = await supabase.auth.getSession();
      setMatriculaSessao(session?.user.email?.split('@')[0] ?? null);
    }
    setMotivoBloqueio(m ?? null);
    setEtapa(e);
  }, [supabase, router]);

  useEffect(() => {
    // Acabou de sair: garante que nada da sessão anterior ficou no navegador e mostra a tela de entrada
    let saiu = false;
    try { saiu = sessionStorage.getItem('siger-rh:saiu') === '1'; sessionStorage.removeItem('siger-rh:saiu'); } catch { /* sem armazenamento */ }
    if (saiu || motivo) {
      (async () => {
        try {
          await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 2000))]);
        } catch { /* já saiu */ }
        apagarSessaoLocal();
        setEtapa('entrar');
      })();
      return;
    }
    avancar();
  }, [avancar, motivo, supabase]);

  return (
    <div className="grid min-h-dvh w-full bg-papel lg:h-dvh lg:grid-cols-[minmax(0,5.5fr)_minmax(0,6.5fr)] lg:overflow-hidden">
      {/* Painel institucional */}
      <section className="relative flex h-full flex-col justify-between overflow-hidden bg-electric-cobalt p-8 text-white sm:p-14 lg:p-16">
        <div className="relative z-10 flex items-center justify-between gap-4 pb-4">
          <div>
            <p className="text-sm font-bold tracking-tight text-white">Fundação de Saúde Pública de São Sebastião</p>
            <p className="text-xs text-powder-blue">Recursos Humanos | SESAU</p>
          </div>
          <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-deep-cobalt px-3.5 py-1 text-[11px] font-semibold text-powder-blue shadow-xs">
            <ShieldCheck className="size-3.5" aria-hidden />
            Portal Seguro
          </div>
        </div>

        <div className="relative z-10 my-auto flex max-w-lg flex-col items-start py-6 text-left">
          <Image src="/logo-siger-rh.png" alt="SIGER RH" width={640} height={310} className="mb-5 h-24 w-auto object-contain sm:h-28" priority />
          <p className="text-xs font-bold uppercase tracking-wider text-powder-blue">Ajustes de ponto e folgas</p>
          <p className="mt-1.5 text-2xl font-extrabold leading-snug tracking-tight text-white sm:text-3xl">
            Pedir, analisar e acompanhar em um só lugar
          </p>
          <ol className="mt-5 hidden max-w-md space-y-2.5 sm:block">
            {PASSOS.map(([quem, texto], i) => (
              <li key={quem} className="flex gap-3 text-sm leading-snug text-powder-blue">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">{i + 1}</span>
                <span><span className="font-semibold text-white">{quem}</span> {texto}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative z-10 hidden border-t border-white/15 pt-5 text-xs text-white/70 sm:block">
          <p>Acesso pessoal e intransferível. As ações ficam registradas.</p>
        </div>
        <div className="pointer-events-none absolute -bottom-20 -right-20 size-96 rounded-full bg-deep-cobalt/60 blur-3xl" />
      </section>

      {/* Cartão de acesso */}
      <main className="flex h-full items-center justify-center overflow-y-auto p-6 sm:p-12 lg:p-16">
        <div className="my-auto w-full max-w-md rounded-3xl border border-linha bg-white p-7 shadow-lg sm:p-10">
          <div className="mb-6 flex justify-center">
            <Image src="/header-brasoes.png" alt="SESAU, FSPSS e Governo Municipal de São Sebastião" width={640} height={132} className="h-9 w-auto object-contain" priority />
          </div>

          {motivo === 'inatividade' && etapa === 'entrar' && (
            <p role="status" className="mb-5 rounded-xl bg-warning-light px-4 py-2.5 text-xs font-medium text-warning">
              Por segurança, a sessão foi encerrada depois de um tempo sem uso. Entre novamente.
            </p>
          )}

          {etapa === null && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-gray" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Verificando o acesso
            </div>
          )}
          {etapa === 'entrar' && <Entrar onOk={avancar} />}
          {etapa === 'cadastrar_mfa' && <CadastrarMfa onOk={avancar} />}
          {etapa === 'confirmar_mfa' && <ConfirmarMfa onOk={avancar} />}
          {etapa === 'trocar_senha' && <TrocarSenha matricula={matriculaSessao} onOk={avancar} />}
          {etapa === 'bloqueado' && (
            <Bloco icone={LockKeyhole} titulo="Acesso não liberado" texto={motivoBloqueio ?? "Esta matrícula está sem acesso no momento. Procure a Direção ou o RH da sua unidade."}>
              <button type="button" className={botao} onClick={() => sairDoSistema()}>Voltar</button>
            </Bloco>
          )}

          {etapa && etapa !== 'entrar' && etapa !== 'bloqueado' && (
            <button type="button" onClick={() => sairDoSistema()}
              className="mx-auto mt-5 flex items-center gap-1.5 text-xs font-medium text-slate-gray hover:text-ink-charcoal">
              <LogOut className="size-3.5" aria-hidden /> Sair e entrar com outra matrícula
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Bloco({ icone: Icone, titulo, texto, children }: { icone: typeof ShieldCheck; titulo: string; texto: ReactNode; children: ReactNode }) {
  return (
    <div>
      <span className="flex size-11 items-center justify-center rounded-2xl bg-lavender-mist text-electric-cobalt">
        <Icone className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-charcoal">{titulo}</h1>
      <p className="mt-1 text-sm leading-relaxed text-slate-gray">{texto}</p>
      {children}
    </div>
  );
}

function Erro({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-xl border border-danger/20 bg-danger-light px-4 py-2.5 text-xs font-medium text-danger">
      {children}
    </p>
  );
}

/** 1. Matrícula e senha */
function Entrar({ onOk }: { onOk: () => void }) {
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    setEspera(segundosBloqueado());
    const t = setInterval(() => setEspera(segundosBloqueado()), 1000);
    return () => clearInterval(t);
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (espera > 0) return;
    setErro(null);
    setEnviando(true);
    const { data, error } = await createClient().auth.signInWithPassword({ email: emailDaMatricula(matricula), password: senha });
    if (error || !data.session) {
      setEnviando(false);
      if (error?.status === 429) return setErro('Muitas tentativas. Aguarde alguns minutos e tente de novo.');
      if (/banned/i.test(error?.message ?? '') || error?.code === 'user_banned') {
        return setErro('Este acesso está desativado. Procure a Direção ou o RH da sua unidade.');
      }
      registrarFalha();
      setEspera(segundosBloqueado());
      return setErro(/invalid/i.test(error?.message ?? '')
        ? 'Matrícula ou senha incorretas.'
        : 'Não foi possível entrar. Verifique a conexão e tente novamente.');
    }
    zerarFalhas();
    setSenha('');
    onOk();
  }

  return (
    <Bloco icone={UserCheck} titulo="Entrar" texto="Use a sua matrícula e senha.">
      <form onSubmit={enviar} className="mt-6 space-y-4" noValidate>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-gray" htmlFor="matricula">Matrícula</label>
          <input id="matricula" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={40}
            value={matricula} onChange={(e) => setMatricula(e.target.value)} className={campo} placeholder="Ex.: 12345" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-gray" htmlFor="senha">Senha</label>
          <input id="senha" type="password" autoComplete="current-password" required maxLength={72}
            value={senha} onChange={(e) => setSenha(e.target.value)} className={campo} placeholder="Digite sua senha" />
        </div>
        {erro && <Erro>{erro}</Erro>}
        {espera > 0 && <Erro>Muitas tentativas seguidas. Aguarde {espera} segundos para tentar de novo.</Erro>}
        <button type="submit" disabled={enviando || espera > 0 || !matricula.trim() || !senha} className={botao}>
          {enviando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Entrar
        </button>
        <p className="pt-2 text-center text-xs leading-relaxed text-slate-gray">
          Esqueceu a senha ou ainda não tem acesso? Procure a Direção ou o RH da sua unidade.
        </p>
      </form>
    </Bloco>
  );
}

/** 2a. Primeiro acesso da Direção: cadastrar o app autenticador */
function CadastrarMfa({ onOk }: { onOk: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [fator, setFator] = useState<{ id: string; qr: string; segredo: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    iniciarCadastroMfa(supabase).then((r) => {
      if (!vivo) return;
      if (r.erro) setErro(r.erro);
      if (r.fator) setFator(r.fator);
    });
    return () => {
      vivo = false;
    };
  }, [supabase, tentativa]);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!fator) return;
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo.trim() });
    setEnviando(false);
    if (error) return setErro('Código incorreto ou vencido. Confira o horário do celular e digite o código atual.');
    onOk();
  }

  return (
    <Bloco icone={Smartphone} titulo="Verificação em duas etapas"
      texto="Para proteger os dados dos funcionários, o acesso da Direção usa um código do celular além da senha. Faça isso uma vez só.">
      <ol className="mt-5 space-y-2 text-sm text-mid-graphite">
        <li><span className="font-semibold">1.</span> Instale um app autenticador (Google Authenticator, Microsoft Authenticator ou similar).</li>
        <li><span className="font-semibold">2.</span> No app, escolha adicionar conta e leia o código abaixo.</li>
        <li><span className="font-semibold">3.</span> Digite o número de 6 dígitos que aparecer no app.</li>
      </ol>
      <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border border-linha bg-faint-gray p-4">
        {fator ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fator.qr} alt="Código QR para o app autenticador" className="size-44 rounded-xl bg-white p-2" />
        ) : erro ? (
          <button type="button" onClick={() => setTentativa((t) => t + 1)}
            className="my-14 min-h-[44px] rounded-full border border-linha bg-white px-5 text-sm font-semibold text-electric-cobalt hover:bg-lavender-mist">
            Tentar de novo
          </button>
        ) : (
          <Loader2 className="my-16 size-6 animate-spin text-electric-cobalt" aria-label="Gerando código" />
        )}
        {fator && (
          <p className="text-center text-[11px] text-slate-gray">
            Sem câmera? Digite esta chave no app: <span className="break-all font-mono text-ink-charcoal">{fator.segredo}</span>
          </p>
        )}
      </div>
      <form onSubmit={confirmar} className="mt-4" noValidate>
        <CampoCodigo valor={codigo} onChange={setCodigo} />
        {erro && <Erro>{erro}</Erro>}
        <button type="submit" disabled={!fator || enviando || codigo.length !== 6} className={botao}>
          {enviando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Confirmar e continuar
        </button>
      </form>
    </Bloco>
  );
}

/** 2b. Já tem app autenticador: pedir o código */
function ConfirmarMfa({ onOk }: { onOk: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { data: lista } = await supabase.auth.mfa.listFactors();
    const fator = lista?.totp?.[0];
    if (!fator) {
      setEnviando(false);
      return setErro('Nenhum app autenticador encontrado. Saia e entre de novo.');
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo.trim() });
    setEnviando(false);
    if (error) return setErro('Código incorreto ou vencido. Digite o código atual do app.');
    onOk();
  }

  return (
    <Bloco icone={Smartphone} titulo="Código de verificação" texto="Abra o app autenticador no celular e digite o código de 6 dígitos do SIGER RH.">
      <form onSubmit={confirmar} className="mt-6" noValidate>
        <CampoCodigo valor={codigo} onChange={setCodigo} />
        {erro && <Erro>{erro}</Erro>}
        <button type="submit" disabled={enviando || codigo.length !== 6} className={botao}>
          {enviando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Confirmar
        </button>
        <p className="pt-3 text-center text-xs leading-relaxed text-slate-gray">
          Trocou ou perdeu o celular? Peça a outra pessoa da Direção para liberar um novo cadastro.
        </p>
      </form>
    </Bloco>
  );
}

function CampoCodigo({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-gray" htmlFor="codigo">Código do app</label>
      <input id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
        value={valor} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className={`${campo} text-center font-mono text-xl tracking-[0.5em]`} placeholder="000000" />
    </div>
  );
}

/** 3. Primeiro acesso (ou senha redefinida): criar a senha pessoal */
function TrocarSenha({ matricula, onOk }: { matricula: string | null; onOk: () => void }) {
  const [nova, setNova] = useState('');
  const [repete, setRepete] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const p = problemaSenha(nova, matricula);
    if (p) return setErro(p);
    if (nova !== repete) return setErro('As duas senhas não são iguais.');
    setErro(null);
    setEnviando(true);
    const { error } = await createClient().auth.updateUser({ password: nova });
    setEnviando(false);
    if (error) {
      return setErro(/different|same/i.test(error.message) ? 'A nova senha precisa ser diferente da senha inicial.'
        : /weak|pwned|leaked/i.test(error.message) ? 'Esta senha aparece em listas de senhas vazadas. Escolha outra.'
        : 'Não foi possível salvar a senha. Tente novamente.');
    }
    onOk();
  }

  return (
    <Bloco icone={KeyRound} titulo="Crie a sua senha" texto="A senha inicial é temporária. Crie uma senha pessoal para continuar; ninguém mais vai saber qual é.">
      <form onSubmit={salvar} className="mt-6 space-y-4" noValidate>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-gray" htmlFor="nova">Nova senha</label>
          <input id="nova" type="password" autoComplete="new-password" maxLength={72} value={nova} onChange={(e) => setNova(e.target.value)} className={campo} />
          <p className="mt-1 text-xs text-slate-gray">Pelo menos 8 caracteres, com letras e números. Não use a matrícula.</p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-gray" htmlFor="repete">Repita a nova senha</label>
          <input id="repete" type="password" autoComplete="new-password" maxLength={72} value={repete} onChange={(e) => setRepete(e.target.value)} className={campo} />
        </div>
        {erro && <Erro>{erro}</Erro>}
        <button type="submit" disabled={enviando || !nova || !repete} className={botao}>
          {enviando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Salvar e entrar
        </button>
      </form>
    </Bloco>
  );
}
