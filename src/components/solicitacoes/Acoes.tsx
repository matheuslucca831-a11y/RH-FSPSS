'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemErro } from '@/lib/formato';
import { MOTIVOS_AUSENCIA, ROTULO_VAGA, type ItemFila, type MotivoAusencia, type Solicitacao, type Vaga } from '@/lib/solicitacoes';
import { Botao, campoCls, inputCls } from '@/components/ui';

/** Avisa o menu lateral para recontar as pendências */
export const avisarMudanca = () => window.dispatchEvent(new Event('siger:pendencias'));

/**
 * Assinar / negar conforme a Circular 254/2026.
 * O item da fila (vindo do banco) diz em que condição a pessoa assina:
 * titular, Gerente no lugar do Enfermeiro, Supervisor no lugar de uma chefia, Coordenação ou Direção.
 */
export function AcoesAssinatura({ s, item, onFeito }: { s: Solicitacao; item: ItemFila; onFeito: (msg: string) => void }) {
  const [negando, setNegando] = useState(false);
  const [obs, setObs] = useState('');
  const [vaga, setVaga] = useState<Vaga | ''>(() => (item.como === 'supervisor' ? item.ausentes[0] ?? item.vagas[0] ?? '' : item.vagas[0] ?? ''));
  const [motivo, setMotivo] = useState<MotivoAusencia | ''>('');
  const [sozinho, setSozinho] = useState(false);
  const [ocupado, setOcupado] = useState<'sim' | 'nao' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const titular = item.como === 'titular';
  const outra = s.pendentes.find((v) => v !== item.vagas[0]);
  const podeSozinho = titular && s.categoria === 'folga' && s.gozo_imediato && s.fluxo === 'ambos' && s.pendentes.length === 2 && !!outra;

  // Precisa declarar o motivo da ausência (quando ela não está registrada no sistema)?
  const pedeMotivo =
    item.como === 'gerente_substituto' ? item.precisa_motivo
      : item.como === 'supervisor' ? (s.fluxo === 'um' ? item.precisa_motivo : !!vaga && !item.ausentes.includes(vaga as Vaga))
      : podeSozinho && sozinho ? !item.ausentes.includes(outra as Vaga)
      : false;
  const ausenteDe = item.como === 'gerente_substituto' ? 'o Enfermeiro responsável'
    : item.como === 'supervisor' ? (s.fluxo === 'um' ? 'o Enfermeiro e o Gerente' : vaga ? `o ${ROTULO_VAGA[vaga]}` : 'a chefia')
    : outra ? `o ${ROTULO_VAGA[outra]}` : 'a outra chefia';

  // O que acontece depois desta assinatura
  const restam = s.situacao === 'Aguardando chefia' && s.fluxo === 'ambos' && s.pendentes.length > 1 && !sozinho;
  const rotuloAprovar = restam ? 'Assinar'
    : s.situacao !== 'Aguardando direção' && s.precisa_direcao ? 'Assinar e enviar à Direção'
    : 'Aprovar';

  async function decidir(aprovar: boolean) {
    if (!aprovar && !obs.trim()) return setErro('Escreva o motivo da negativa.');
    if (item.como === 'supervisor' && !vaga) return setErro('Escolha no lugar de quem você assina.');
    if (aprovar && pedeMotivo && !motivo) return setErro(`Informe por que ${ausenteDe} está ausente.`);
    setErro(null);
    setOcupado(aprovar ? 'sim' : 'nao');
    const { data, error } = await createClient().rpc('assinar', {
      p_id: s.id, p_aprovar: aprovar, p_obs: obs.trim() || null,
      p_no_lugar_de: item.como === 'supervisor' ? vaga || null : null,
      p_motivo_ausencia: pedeMotivo || (!aprovar && motivo) ? motivo || null : null,
      p_outra_ciente: podeSozinho && sozinho,
    });
    setOcupado(null);
    if (error) return setErro(mensagemErro(error));
    avisarMudanca();
    onFeito(
      !aprovar ? `Pedido de ${s.solicitante_nome} negado.`
        : data === 'Aguardando chefia' ? `Você assinou o pedido de ${s.solicitante_nome}. Falta a outra assinatura da unidade.`
        : data === 'Aguardando direção' ? `Pedido de ${s.solicitante_nome} assinado e enviado à Direção.`
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

  const comOpcoes = item.como === 'supervisor' || item.como === 'gerente_substituto' || podeSozinho;
  return (
    <div className={comOpcoes ? 'w-full space-y-3' : 'contents'}>
      {comOpcoes && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-warning/25 bg-warning-light/40 p-3.5 text-sm">
          {item.como === 'gerente_substituto' && (
            <p className="w-full text-warning">Saída antecipada e estágio: o Gerente assina só na ausência do Enfermeiro responsável.</p>
          )}
          {item.como === 'supervisor' && s.fluxo !== 'um' && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-tinta-suave">Assinar no lugar de</span>
              <select value={vaga} onChange={(e) => setVaga(e.target.value as Vaga)} className={`${campoCls} min-w-56`}>
                {item.vagas.map((v) => (
                  <option key={v} value={v}>{ROTULO_VAGA[v]}{item.ausentes.includes(v) ? ' (ausência registrada)' : ''}</option>
                ))}
              </select>
            </label>
          )}
          {item.como === 'supervisor' && s.fluxo === 'um' && (
            <p className="w-full text-warning">Farmácia: o Supervisor assina só com o Enfermeiro e o Gerente ausentes.</p>
          )}
          {podeSozinho && (
            <label className="flex w-full items-start gap-2">
              <input type="checkbox" checked={sozinho} onChange={(e) => setSozinho(e.target.checked)} className="mt-0.5 size-4 accent-electric-cobalt" />
              <span>
                <strong>Folga para gozo imediato:</strong> assinar sozinho(a). O {outra ? ROTULO_VAGA[outra] : 'outra chefia'} está ausente,
                houve consenso prévio e ele(a) está ciente.
              </span>
            </label>
          )}
          {pedeMotivo && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-tinta-suave">Por que {ausenteDe} está ausente? *</span>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoAusencia)} className={`${campoCls} min-w-56`}>
                <option value="">Selecione</option>
                {MOTIVOS_AUSENCIA.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
          )}
          {!pedeMotivo && (item.como === 'supervisor' || item.como === 'gerente_substituto') && (
            <p className="text-xs text-tinta-suave">Ausência registrada no sistema: não é preciso declarar o motivo.</p>
          )}
        </div>
      )}
      {erro && <p role="alert" className="w-full text-right text-sm text-erro">{erro}</p>}
      <div className={comOpcoes ? 'flex flex-wrap justify-end gap-2' : 'contents'}>
        <Botao variante="secundario" onClick={() => setNegando(true)} disabled={!!ocupado}>
          <X className="size-4" aria-hidden /> Negar
        </Botao>
        <Botao carregando={ocupado === 'sim'} onClick={() => decidir(true)}>
          <Check className="size-4" aria-hidden /> {rotuloAprovar}
        </Botao>
      </div>
    </div>
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
