'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Printer, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/client';
import { dataHoraBR } from '@/lib/formato';
import { resumoAparelho } from '@/lib/aparelho';
import { CATEGORIAS, CAMPOS_SOLICITACAO, ROTULO_VAGA, horarios, periodo, rotuloTipo, type Solicitacao } from '@/lib/solicitacoes';

type Extra = {
  metodo_assinatura: 'senha' | null; hash_documento: string | null;
  codigo_verificacao: string | null; assinado_ip: string | null; assinado_aparelho: string | null;
};
type AssinaturaCompleta = {
  id: number; etapa: string; decisao: 'Aprovado' | 'Negado'; nome: string; papel: string; substituicao: string | null; obs: string | null;
  criado_em: string; metodo: 'senha' | null; hash_assinatura: string | null; ip: string | null; aparelho: string | null;
};

/** Comprovante da solicitação com as assinaturas, o código do documento e o QR code de verificação */
export default function Comprovante({ id }: { id: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [s, setS] = useState<(Solicitacao & Extra) | null>(null);
  const [ass, setAss] = useState<AssinaturaCompleta[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return setErro('Comprovante não encontrado.');
    let vivo = true;
    (async () => {
      const [r, a] = await Promise.all([
        supabase.from('solicitacoes')
          .select(`${CAMPOS_SOLICITACAO}, metodo_assinatura, hash_documento, codigo_verificacao, assinado_ip, assinado_aparelho`)
          .eq('id', id).maybeSingle(),
        supabase.from('assinaturas')
          .select('id, etapa, decisao, nome, papel, substituicao, obs, criado_em, metodo, hash_assinatura, ip, aparelho')
          .eq('solicitacao_id', id).order('criado_em'),
      ]);
      if (!vivo) return;
      if (r.error || !r.data) return setErro('Comprovante não encontrado ou sem permissão para ver.');
      const doc = r.data as unknown as Solicitacao & Extra;
      setS(doc);
      setAss((a.data as AssinaturaCompleta[]) ?? []);
      if (doc.codigo_verificacao) {
        setQr(await QRCode.toDataURL(`${window.location.origin}/verificar?c=${doc.codigo_verificacao}`,
          { margin: 1, width: 220, color: { dark: '#0b1f4d', light: '#ffffff' } }));
      }
    })();
    return () => { vivo = false; };
  }, [id, supabase]);

  if (erro) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-papel p-4">
        <div className="dock-card max-w-md p-6 text-center">
          <p className="text-sm text-danger">{erro}</p>
          <Link href="/minhas" className="dock-btn-primary mt-4 inline-flex">Voltar</Link>
        </div>
      </div>
    );
  }
  if (!s) return <div className="flex min-h-dvh items-center justify-center bg-papel text-sm text-tinta-suave">Carregando comprovante…</div>;

  const hs = horarios(s);
  const urlVerificar = typeof window !== 'undefined' ? `${window.location.origin}/verificar` : '/verificar';

  return (
    <div className="min-h-dvh bg-papel print:bg-white">
      {/* Barra (não sai na impressão) */}
      <div className="sticky top-0 z-10 border-b border-linha bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4 py-3">
          <button type="button" onClick={() => (history.length > 1 ? history.back() : (location.href = '/minhas'))}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-slate-gray hover:bg-faint-gray">
            <ArrowLeft className="size-4" aria-hidden /> Voltar
          </button>
          <button type="button" onClick={() => window.print()} className="dock-btn-primary inline-flex items-center gap-2">
            <Printer className="size-4" aria-hidden /> Imprimir ou salvar PDF
          </button>
        </div>
      </div>

      <article className="mx-auto my-6 max-w-[210mm] bg-white px-6 py-8 text-[13px] leading-relaxed text-ink-charcoal shadow-sm sm:px-12 print:my-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="flex items-center justify-between gap-4 border-b-2 border-electric-cobalt pb-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="size-12 rounded-lg object-contain" />
            <div>
              <p className="text-lg font-bold text-electric-cobalt">SIGER RH</p>
              <p className="text-[11px] text-slate-gray">Fundação de Saúde Pública de São Sebastião</p>
            </div>
          </div>
          <img src="/header-brasoes.png" alt="" className="h-10 object-contain" />
        </header>

        <h1 className="mt-5 text-base font-bold">Comprovante de solicitação assinada eletronicamente</h1>
        <p className="text-[12px] text-slate-gray">Protocolo <span className="font-mono font-semibold text-ink-charcoal">{s.protocolo}</span> | Situação: <strong>{s.situacao}</strong></p>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 print:grid-cols-2">
          <Item r="Solicitante" v={s.solicitante_nome} />
          <Item r="Matrícula" v={s.solicitante_matricula} />
          <Item r="Cargo" v={s.solicitante_cargo} />
          <Item r="Unidade" v={s.unidade_nome} />
          <Item r="Pedido" v={`${CATEGORIAS[s.categoria].titulo}: ${rotuloTipo(s)}`} />
          <Item r="Período" v={periodo(s)} />
          {hs.length > 0 && <Item r="Horários" v={hs.map((h) => `${h.rotulo} ${h.hora}`).join(' | ')} />}
          {s.unidade_destino_nome && <Item r="Unidade de destino" v={s.unidade_destino_nome} />}
          {s.referencia_protocolo && <Item r="Cancela o protocolo" v={s.referencia_protocolo} />}
          {s.gozo_imediato && <Item r="Observação" v="Folga para gozo imediato" />}
          {s.anexo_nome && <Item r="Comprovante anexado" v={s.anexo_nome} />}
        </dl>
        {s.justificativa && (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-gray">Justificativa</p>
            <p className="whitespace-pre-line">{s.justificativa}</p>
          </div>
        )}

        <h2 className="mt-6 border-b border-linha pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-gray">Assinaturas</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
          <Bloco titulo="Solicitante" nome={s.solicitante_nome} decisao="Solicitou" em={s.criado_em}
            metodo={s.metodo_assinatura} ip={s.assinado_ip} aparelho={s.assinado_aparelho} />
          {ass.map((a) => (
            <Bloco key={a.id} titulo={ROTULO_VAGA[a.etapa] ?? a.etapa} nome={a.nome} decisao={a.decisao === 'Aprovado' ? 'Assinou (aprovado)' : 'Negou'}
              em={a.criado_em} metodo={a.metodo} ip={a.ip} aparelho={a.aparelho} nota={a.substituicao} obs={a.obs} />
          ))}
        </div>

        <footer className="mt-6 flex flex-col gap-4 border-t border-linha pt-4 sm:flex-row sm:items-start print:flex-row">
          {qr && <img src={qr} alt="QR code para verificar este documento" className="size-28 shrink-0" />}
          <div className="min-w-0 space-y-1 text-[11px] text-slate-gray">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-charcoal">
              <ShieldCheck className="size-4 text-forest" aria-hidden /> Documento assinado eletronicamente (Lei nº 14.063/2020)
            </p>
            <p>Código de verificação: <span className="font-mono text-[13px] font-bold text-ink-charcoal">{s.codigo_verificacao}</span></p>
            <p>Confira a autenticidade lendo o QR code ou em <span className="font-semibold">{urlVerificar}</span> com o código acima.</p>
            <p className="break-all">Código do documento (SHA-256): <span className="font-mono">{s.hash_documento}</span></p>
            <p>Cada assinatura foi feita por usuário identificado pelo login no SIGER RH, com registro de data e hora do servidor,
              aparelho e endereço de rede. Qualquer alteração no conteúdo depois da assinatura muda o código do documento.</p>
          </div>
        </footer>
      </article>
    </div>
  );
}

function Item({ r, v }: { r: string; v?: string | null }) {
  if (!v) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-slate-gray">{r}:</dt>
      <dd className="min-w-0 font-medium">{v}</dd>
    </div>
  );
}

function Bloco({ titulo, nome, decisao, em, metodo, ip, aparelho, nota, obs }: {
  titulo: string; nome: string; decisao: string; em: string; metodo: string | null;
  ip: string | null; aparelho: string | null; nota?: string | null; obs?: string | null;
}) {
  return (
    <div className="break-inside-avoid rounded-xl border border-linha p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-electric-cobalt">{titulo}</p>
      <div className="mt-1 flex items-end pb-1">
        {metodo === 'senha' ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-forest/30 bg-forest-light px-2 py-1 text-[11px] font-semibold text-forest">
              <KeyRound className="size-3.5" aria-hidden /> Assinado com confirmação de senha
            </span>
          ) : <span className="text-[11px] text-slate-gray">Registrado antes da assinatura eletrônica</span>}
      </div>
      <p className="mt-1 font-semibold">{nome}</p>
      <p className="text-[11px] text-slate-gray">{decisao} em {dataHoraBR(em)}</p>
      {nota && <p className="text-[11px] text-slate-gray">{nota}</p>}
      {obs && <p className="text-[11px]">Observação: {obs}</p>}
      {(ip || aparelho) && <p className="text-[10px] text-slate-gray">Aparelho: {resumoAparelho(aparelho)} | Rede: {ip ?? 'não informado'}</p>}
    </div>
  );
}
