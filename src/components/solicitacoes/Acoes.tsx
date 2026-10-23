'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemErro } from '@/lib/formato';
import type { Solicitacao } from '@/lib/solicitacoes';
import { Botao, inputCls } from '@/components/ui';

/** Avisa o menu lateral para recontar as pendências */
export const avisarMudanca = () => window.dispatchEvent(new Event('siger:pendencias'));

/** Aprovar / negar (negar pede o motivo, que a pessoa vai ver) */
export function AcoesDecisao({ s, quem, onFeito }: { s: Solicitacao; quem: 'chefia' | 'direcao'; onFeito: (msg: string) => void }) {
  const [negando, setNegando] = useState(false);
  const [obs, setObs] = useState('');
  const [ocupado, setOcupado] = useState<'sim' | 'nao' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const vaiParaDirecao = quem === 'chefia' && s.precisa_direcao;

  async function decidir(aprovar: boolean) {
    if (!aprovar && !obs.trim()) return setErro('Escreva o motivo da negativa.');
    setErro(null);
    setOcupado(aprovar ? 'sim' : 'nao');
    const { data, error } = await createClient().rpc(quem === 'chefia' ? 'decidir_chefia' : 'decidir_direcao', {
      p_id: s.id, p_aprovar: aprovar, p_obs: obs.trim() || null,
    });
    setOcupado(null);
    if (error) return setErro(mensagemErro(error));
    avisarMudanca();
    onFeito(
      !aprovar ? `Pedido de ${s.solicitante_nome} negado.`
        : data === 'Aguardando direção' ? `Pedido de ${s.solicitante_nome} aprovado e enviado à Direção.`
        : `Pedido de ${s.solicitante_nome} aprovado.`,
    );
  }

  if (negando) {
    return (
      <div className="w-full rounded-2xl border border-danger/25 bg-danger-light/50 p-4 sm:min-w-96">
        <label className="block text-xs font-semibold text-erro" htmlFor={`motivo-${s.id}`}>Motivo da negativa (a pessoa vai ver)</label>
        <textarea id={`motivo-${s.id}`} rows={2} value={obs} onChange={(e) => setObs(e.target.value)} autoFocus
          className={`${inputCls} mt-1`} />
        {erro && <p role="alert" className="mt-2 text-sm text-erro">{erro}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <Botao variante="discreto" onClick={() => { setNegando(false); setErro(null); }}>Voltar</Botao>
          <Botao variante="perigo" carregando={ocupado === 'nao'} onClick={() => decidir(false)}>
            <X className="size-4" aria-hidden /> Confirmar negativa
          </Botao>
        </div>
      </div>
    );
  }

  return (
    <>
      {erro && <p role="alert" className="w-full text-right text-sm text-erro">{erro}</p>}
      <Botao variante="secundario" onClick={() => setNegando(true)} disabled={!!ocupado}>
        <X className="size-4" aria-hidden /> Negar
      </Botao>
      <Botao carregando={ocupado === 'sim'} onClick={() => decidir(true)}>
        <Check className="size-4" aria-hidden /> {vaiParaDirecao ? 'Aprovar e enviar à Direção' : 'Aprovar'}
      </Botao>
    </>
  );
}

/** Cancelar o próprio pedido enquanto está em análise */
export function AcaoCancelar({ s, onFeito }: { s: Solicitacao; onFeito: (msg: string) => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function cancelar() {
    setOcupado(true);
    const { error } = await createClient().rpc('cancelar_solicitacao', { p_id: s.id, p_motivo: null });
    setOcupado(false);
    if (error) return setErro(mensagemErro(error));
    onFeito(`Solicitação ${s.protocolo} cancelada.`);
  }

  if (!confirmando) {
    return <Botao variante="discreto" onClick={() => setConfirmando(true)}>Cancelar pedido</Botao>;
  }
  return (
    <>
      {erro && <span role="alert" className="text-sm text-erro">{erro}</span>}
      <span className="text-sm text-tinta-suave">Cancelar este pedido?</span>
      <Botao variante="discreto" onClick={() => setConfirmando(false)}>Não</Botao>
      <Botao variante="perigo" carregando={ocupado} onClick={cancelar}>Sim, cancelar</Botao>
    </>
  );
}

/** Arquivar / restaurar (Direção) */
export function AcaoArquivar({ s, onFeito }: { s: Solicitacao; onFeito: (msg: string) => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!s.arquivado && !['Aprovado', 'Negado', 'Cancelado'].includes(s.situacao)) return null;

  async function alternar() {
    setOcupado(true);
    const { error } = await createClient().rpc('arquivar_solicitacao', { p_id: s.id, p_arquivar: !s.arquivado });
    setOcupado(false);
    if (error) return setErro(mensagemErro(error));
    onFeito(s.arquivado ? `Solicitação ${s.protocolo} restaurada.` : `Solicitação ${s.protocolo} arquivada.`);
  }
  return (
    <>
      {erro && <span role="alert" className="text-sm text-erro">{erro}</span>}
      <Botao variante="secundario" carregando={ocupado} onClick={alternar}>{s.arquivado ? 'Restaurar' : 'Arquivar'}</Botao>
    </>
  );
}

/** Excluir de vez (Direção) — apaga também o comprovante */
export function AcaoExcluir({ s, onFeito }: { s: Solicitacao; onFeito: (msg: string) => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function excluir() {
    setOcupado(true);
    const supabase = createClient();
    const { error, count } = await supabase.from('solicitacoes').delete({ count: 'exact' }).eq('id', s.id);
    if (!error && count && s.anexo_path && s.anexo_bucket === 'comprovantes') await supabase.storage.from('comprovantes').remove([s.anexo_path]);
    setOcupado(false);
    if (error) return setErro(mensagemErro(error));
    if (!count) return setErro('Você não tem permissão para excluir.');
    onFeito(`Solicitação ${s.protocolo} excluída.`);
  }

  if (!confirmando) return <Botao variante="discreto" onClick={() => setConfirmando(true)}>Excluir</Botao>;
  return (
    <>
      {erro && <span role="alert" className="text-sm text-erro">{erro}</span>}
      <span className="text-sm text-erro">Excluir de vez? Não dá para desfazer.</span>
      <Botao variante="discreto" onClick={() => setConfirmando(false)}>Não</Botao>
      <Botao variante="perigo" carregando={ocupado} onClick={excluir}>Excluir</Botao>
    </>
  );
}
