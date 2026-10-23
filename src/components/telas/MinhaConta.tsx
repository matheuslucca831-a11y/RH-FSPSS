'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { KeyRound, Laptop, Loader2, ShieldCheck, Smartphone, Trash2, UserCog } from 'lucide-react';
import type { Factor } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { iniciarCadastroMfa, problemaSenha } from '@/lib/acesso';
import { dataHoraBR } from '@/lib/formato';
import { sairDoSistema } from '@/lib/contextoPerfil';
import { PAPEIS, type Perfil } from '@/lib/types';
import { Aviso, Botao, Cabecalho, Campo, Selo, inputCls } from '@/components/ui';

export default function MinhaConta({ perfil }: { perfil: Perfil }) {
  const supabase = useMemo(() => createClient(), []);
  const [ultimoAcesso, setUltimoAcesso] = useState<string | null>(null);
  const [mfaExigido, setMfaExigido] = useState(false);

  useEffect(() => {
    supabase.from('perfis').select('ultimo_acesso_em').eq('id', perfil.id).maybeSingle()
      .then(({ data }) => setUltimoAcesso((data as { ultimo_acesso_em: string | null } | null)?.ultimo_acesso_em ?? null));
    supabase.rpc('minha_seguranca').then(({ data }) => setMfaExigido(!!(data as { mfa_exigido?: boolean } | null)?.mfa_exigido));
  }, [supabase, perfil.id]);

  return (
    <div className="w-full space-y-6">
      <Cabecalho icone={UserCog} titulo="Minha conta" descricao="Senha, verificação em duas etapas e aparelhos conectados." />

      <section className="dock-card grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
        <Info rotulo="Nome" valor={perfil.nome} />
        <Info rotulo="Matrícula" valor={perfil.matricula} />
        <Info rotulo="Acesso" valor={`${PAPEIS[perfil.papel].rotulo}${perfil.unidade ? ` | ${perfil.unidade.nome}` : ''}`} />
        <Info rotulo="Cargo" valor={perfil.cargo ?? 'Não informado'} />
        <Info rotulo="Último acesso registrado" valor={ultimoAcesso ? dataHoraBR(ultimoAcesso) : 'Não informado'} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <TrocarSenha matricula={perfil.matricula} />
        <DuasEtapas exigido={mfaExigido} />
      </div>

      <section className="dock-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lavender-mist text-electric-cobalt"><Laptop className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink-charcoal">Aparelhos conectados</h2>
            <p className="mt-0.5 text-sm text-slate-gray">
              Usou o sistema em um computador compartilhado ou perdeu o celular? Encerre o acesso em todos os aparelhos de uma vez.
            </p>
            <Botao variante="secundario" className="mt-4" onClick={() => sairDoSistema(undefined, true)}>Sair de todos os aparelhos</Botao>
          </div>
        </div>
      </section>
    </div>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-gray">{rotulo}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-ink-charcoal">{valor}</p>
    </div>
  );
}

function TrocarSenha({ matricula }: { matricula: string }) {
  const [nova, setNova] = useState('');
  const [repete, setRepete] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setOk(false);
    const p = problemaSenha(nova, matricula);
    if (p) return setErro(p);
    if (nova !== repete) return setErro('As duas senhas não são iguais.');
    setErro(null);
    setOcupado(true);
    const { error } = await createClient().auth.updateUser({ password: nova });
    setOcupado(false);
    if (error) {
      return setErro(/different|same/i.test(error.message) ? 'A nova senha precisa ser diferente da atual.'
        : /aal2|mfa/i.test(error.message) ? 'Confirme o código do app autenticador (saia e entre de novo) antes de trocar a senha.'
        : /reauth|recent/i.test(error.message) ? 'Por segurança, saia e entre de novo antes de trocar a senha.'
        : /weak|pwned|leaked/i.test(error.message) ? 'Esta senha aparece em listas de senhas vazadas. Escolha outra.'
        : 'Não foi possível trocar a senha. Tente novamente.');
    }
    setNova('');
    setRepete('');
    setOk(true);
  }

  return (
    <form onSubmit={salvar} className="dock-card space-y-4 p-5 sm:p-6" noValidate>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-lavender-mist text-electric-cobalt"><KeyRound className="size-5" aria-hidden /></span>
        <h2 className="text-base font-semibold text-ink-charcoal">Trocar senha</h2>
      </div>
      <Campo rotulo="Nova senha" dica="Pelo menos 8 caracteres, com letras e números. Não use a matrícula.">
        <input type="password" autoComplete="new-password" maxLength={72} value={nova} onChange={(e) => setNova(e.target.value)} className={inputCls} />
      </Campo>
      <Campo rotulo="Repita a nova senha">
        <input type="password" autoComplete="new-password" maxLength={72} value={repete} onChange={(e) => setRepete(e.target.value)} className={inputCls} />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tom="info">Senha trocada. Use a nova senha no próximo acesso.</Aviso>}
      <Botao type="submit" carregando={ocupado} disabled={!nova || !repete}>Salvar nova senha</Botao>
    </form>
  );
}

function DuasEtapas({ exigido }: { exigido: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [fatores, setFatores] = useState<Factor[] | null>(null);
  const [novo, setNovo] = useState<{ id: string; qr: string; segredo: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => setFatores((data?.totp ?? []) as Factor[]));
  }, [supabase, versao]);

  async function iniciar() {
    setErro(null);
    setOk(null);
    setOcupado(true);
    const r = await iniciarCadastroMfa(supabase);
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    if (r.fator) setNovo(r.fator);
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!novo) return;
    setOcupado(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: novo.id, code: codigo });
    setOcupado(false);
    if (error) return setErro('Código incorreto ou vencido. Digite o código atual do app.');
    setNovo(null);
    setCodigo('');
    setOk('Verificação em duas etapas ativada para esta conta.');
    setVersao((v) => v + 1);
  }

  async function remover(f: Factor) {
    if (exigido && (fatores?.length ?? 0) <= 1) return setErro('O seu acesso exige a verificação em duas etapas. Cadastre o novo celular antes de remover este.');
    if (!window.confirm('Remover este app autenticador?')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return setErro('Não foi possível remover. Saia e entre de novo com o código do app e tente outra vez.');
    setOk('App autenticador removido.');
    setVersao((v) => v + 1);
  }

  return (
    <section className="dock-card space-y-4 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-lavender-mist text-electric-cobalt"><ShieldCheck className="size-5" aria-hidden /></span>
          <h2 className="text-base font-semibold text-ink-charcoal">Verificação em duas etapas</h2>
        </div>
        {fatores && <Selo texto={fatores.length ? 'Ativa' : exigido ? 'Obrigatória' : 'Desligada'} tom={fatores.length ? 'sucesso' : exigido ? 'atencao' : 'neutro'} />}
      </div>
      <p className="text-sm text-slate-gray">
        Além da senha, o acesso pede um código do app autenticador do celular. {exigido ? 'Obrigatória para o seu tipo de acesso.' : 'Recomendada.'}
      </p>

      {fatores?.map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-linha bg-faint-gray px-3.5 py-2.5 text-sm">
          <span className="flex items-center gap-2"><Smartphone className="size-4 text-slate-gray" aria-hidden /> App autenticador | desde {dataHoraBR(f.created_at)}</span>
          <button type="button" onClick={() => remover(f)} className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-gray hover:bg-white hover:text-danger">
            <Trash2 className="size-3.5" aria-hidden /> Remover
          </button>
        </div>
      ))}

      {novo ? (
        <form onSubmit={confirmar} className="space-y-3" noValidate>
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-linha bg-faint-gray p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={novo.qr} alt="Código QR para o app autenticador" className="size-40 rounded-xl bg-white p-2" />
            <p className="text-center text-[11px] text-slate-gray">Chave: <span className="break-all font-mono text-ink-charcoal">{novo.segredo}</span></p>
          </div>
          <Campo rotulo="Código de 6 dígitos do app">
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${inputCls} text-center font-mono tracking-[0.4em]`} />
          </Campo>
          <div className="flex gap-2">
            <Botao type="submit" carregando={ocupado} disabled={codigo.length !== 6}>Confirmar</Botao>
            <Botao variante="discreto" onClick={() => setNovo(null)}>Cancelar</Botao>
          </div>
        </form>
      ) : (
        <Botao variante="secundario" carregando={ocupado} onClick={iniciar} disabled={!fatores}>
          {fatores === null ? <Loader2 className="size-4 animate-spin" /> : null}
          {fatores?.length ? 'Cadastrar outro celular' : 'Ativar agora'}
        </Botao>
      )}
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tom="info">{ok}</Aviso>}
    </section>
  );
}
