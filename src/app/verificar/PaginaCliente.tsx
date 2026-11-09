'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, KeyRound, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { dataBR, dataHoraBR } from '@/lib/formato';
import { CATEGORIAS, ROTULO_VAGA, type Categoria } from '@/lib/solicitacoes';

type Resultado = {
  encontrado: boolean; protocolo?: string; categoria?: Categoria; tipo?: string; subtipo?: string | null;
  data_inicio?: string; data_fim?: string; unidade?: string; solicitante?: string; matricula?: string; situacao?: string;
  enviado_em?: string; metodo?: string | null; hash_registrado?: string; integro?: boolean;
  assinaturas?: { etapa: string; decisao: string; nome: string; papel: string; substituicao: string | null; em: string; metodo: string | null; integra: boolean }[];
};

function Verificar() {
  const supabase = useMemo(() => createClient(), []);
  const inicial = useSearchParams().get('c') ?? '';
  const [codigo, setCodigo] = useState(inicial);
  const [res, setRes] = useState<Resultado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const conferir = useCallback(async (c: string) => {
    if (c.replace(/[^a-z0-9]/gi, '').length !== 12) return setErro('O código tem 12 letras e números (ex.: A1B2-C3D4-E5F6).');
    setErro(null);
    setCarregando(true);
    const { data, error } = await supabase.rpc('verificar_documento', { p_codigo: c });
    setCarregando(false);
    if (error) return setErro('Não foi possível conferir agora. Tente de novo.');
    setRes(data as Resultado);
  }, [supabase]);

  useEffect(() => { if (inicial) conferir(inicial); }, [inicial, conferir]);

  const enviar = (e: FormEvent) => { e.preventDefault(); conferir(codigo); };
  const ok = res?.encontrado && res.integro && res.assinaturas?.every((a) => a.integra);
  const metodo = (m?: string | null) => (m === 'senha' ? 'confirmação de senha' : 'registro anterior à assinatura eletrônica');

  return (
    <div className="min-h-dvh bg-papel px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="size-12 rounded-xl object-contain" />
          <div>
            <h1 className="text-lg font-bold text-ink-charcoal">Verificar documento</h1>
            <p className="text-sm text-slate-gray">SIGER RH | Fundação de Saúde Pública de São Sebastião</p>
          </div>
        </div>

        <form onSubmit={enviar} className="dock-card mt-6 flex flex-col gap-3 p-5 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Código de verificação</span>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código de verificação"
              maxLength={20} autoComplete="off" spellCheck={false}
              className="w-full rounded-xl border border-linha bg-white px-4 py-2.5 font-mono text-sm tracking-wider outline-none focus:border-electric-cobalt focus:ring-2 focus:ring-electric-cobalt/20" />
          </label>
          <button type="submit" disabled={carregando} className="dock-btn-primary inline-flex items-center justify-center gap-2">
            <Search className="size-4" aria-hidden /> {carregando ? 'Conferindo…' : 'Conferir'}
          </button>
        </form>
        {erro && <p role="alert" className="mt-3 text-sm text-danger">{erro}</p>}

        {res && !res.encontrado && (
          <div className="dock-card mt-4 flex items-start gap-3 p-5">
            <ShieldAlert className="size-6 shrink-0 text-danger" aria-hidden />
            <p className="text-sm">Nenhum documento encontrado com este código. Confira se digitou certo.</p>
          </div>
        )}

        {res?.encontrado && (
          <div className="dock-card mt-4 overflow-hidden">
            <div className={`flex items-start gap-3 p-5 ${ok ? 'bg-forest-light' : 'bg-danger-light'}`}>
              {ok ? <ShieldCheck className="size-7 shrink-0 text-forest" aria-hidden /> : <ShieldAlert className="size-7 shrink-0 text-danger" aria-hidden />}
              <div>
                <p className={`font-bold ${ok ? 'text-forest' : 'text-danger'}`}>{ok ? 'Documento autêntico e íntegro' : 'Atenção: o conteúdo não confere'}</p>
                <p className="text-sm text-mid-graphite">
                  {ok ? 'O conteúdo e as assinaturas são os mesmos do momento em que foram feitos.'
                    : 'O documento foi alterado depois de assinado. Procure o RH da FSPSS.'}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 p-5 text-sm">
              <dt className="text-slate-gray">Protocolo</dt><dd className="font-mono font-semibold">{res.protocolo}</dd>
              <dt className="text-slate-gray">Pedido</dt><dd>{res.categoria ? CATEGORIAS[res.categoria].titulo : ''}: {res.tipo}{res.subtipo ? ` (${res.subtipo})` : ''}</dd>
              <dt className="text-slate-gray">Período</dt><dd>{dataBR(res.data_inicio)}{res.data_fim && res.data_fim !== res.data_inicio ? ` a ${dataBR(res.data_fim)}` : ''}</dd>
              <dt className="text-slate-gray">Solicitante</dt><dd>{res.solicitante} | Matrícula {res.matricula}</dd>
              <dt className="text-slate-gray">Unidade</dt><dd>{res.unidade}</dd>
              <dt className="text-slate-gray">Situação</dt><dd className="font-semibold">{res.situacao}</dd>
            </dl>
            <ul className="divide-y divide-linha border-t border-linha">
              <li className="flex items-start gap-3 px-5 py-3 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden />
                <span>Solicitante assinou em {dataHoraBR(res.enviado_em)} <span className="text-slate-gray">({metodo(res.metodo)})</span></span>
              </li>
              {res.assinaturas?.map((a, i) => (
                <li key={i} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden />
                  <span>
                    <strong>{ROTULO_VAGA[a.etapa] ?? a.etapa}: {a.nome}</strong> {a.decisao === 'Aprovado' ? 'assinou' : 'negou'} em {dataHoraBR(a.em)}
                    <span className="text-slate-gray"> ({metodo(a.metodo)})</span>
                    {a.substituicao && <span className="block text-xs text-slate-gray">{a.substituicao}</span>}
                    {!a.integra && <span className="block text-xs font-semibold text-danger">Esta assinatura não confere</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="break-all border-t border-linha px-5 py-3 text-[11px] text-slate-gray">Código do documento (SHA-256): <span className="font-mono">{res.hash_registrado}</span></p>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-slate-gray">Por privacidade, esta página mostra só o essencial do documento.</p>
      </div>
    </div>
  );
}

export default function PaginaCliente() {
  return <Suspense fallback={null}><Verificar /></Suspense>;
}
