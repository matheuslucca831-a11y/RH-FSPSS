'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemErro } from '@/lib/formato';
import CampoAssinatura, { autorizarComSenha } from '@/components/assinatura/CampoAssinatura';
import { MOTIVOS_AUSENCIA, falta, rotuloVaga, type ItemFila, type MotivoAusencia, type Solicitacao } from '@/lib/solicitacoes';
import { Botao, inputCls } from '@/components/ui';
import Escolha from '@/components/Escolha';

/** Avisa o menu lateral para recontar as pendências */
export const avisarMudanca = () => window.dispatchEvent(new Event('siger:pendencias'));

/**
 * Assinar / negar seguindo o fluxo copiado no pedido.
 * O item da fila (vindo do banco) diz em que condição a pessoa assina:
 * titular de uma vaga, substituto de uma vaga ausente, ou Direção decidindo direto.
 */
export function AcoesAssinatura({ s, item, onFeito }: { s: Solicitacao; item: ItemFila; onFeito: (msg: string) => void }) {
  const et = s.rota?.[s.etapa_atual ?? 0];
  const rotuloDe = (i: string) => (et?.vagas[+i] ? rotuloVaga(et.vagas[+i]) : 'a vaga');
  const [negando, setNegando] = useState(false);
  const [obs, setObs] = useState('');
  const [vaga, setVaga] = useState<string>(() =>
    item.como === 'substituto' ? item.ausentes.find((i) => item.vagas.includes(i)) ?? item.vagas[0] ?? '' : item.vagas[0] ?? '');
  const [motivo, setMotivo] = useState<MotivoAusencia | ''>('');
  /** gozo: folga para gozo imediato (outra chefia ausente e ciente); justificado: segue só com esta assinatura, com justificativa */
  const [modo, setModo] = useState<'' | 'gozo' | 'justificado'>('');
  const [ocupado, setOcupado] = useState<'sim' | 'nao' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [senha, setSenha] = useState('');

  const titular = item.como === 'titular';
  const substituto = item.como === 'substituto';
  const direta = item.como === 'direcao_direta';
  const regraUm = et?.regra === 'um';
  const outra = s.pendentes.find((v) => v !== vaga);
  const podeGozo = titular && s.categoria === 'folga' && s.gozo_imediato && !!et?.gozo_imediato && !regraUm
    && s.pendentes.length === 2 && !!outra;
  const podeJustificar = titular && !regraUm && s.pendentes.length > 1;
  const outros = s.pendentes.filter((v) => v !== vaga).map(rotuloDe).join(' e ');
  const sozinho = modo !== '';

  // Precisa declarar o motivo da ausência (quando ela não está registrada no sistema)?
  const pedeMotivo = substituto ? (regraUm ? item.precisa_motivo : !!vaga && !item.ausentes.includes(vaga))
    : modo === 'gozo' ? !item.ausentes.includes(outra!)
    : false;
  const ausenteDe = substituto
    ? (regraUm && s.pendentes.length > 1 ? s.pendentes.map(rotuloDe).join(' e ') : rotuloDe(vaga))
    : outra ? rotuloDe(outra) : 'a outra chefia';

  // O que acontece depois desta assinatura
  const total = s.rota?.length ?? 1;
  const ultima = (s.etapa_atual ?? 0) >= total - 1;
  const restam = !direta && !regraUm && s.pendentes.length > 1 && !sozinho;
  const proxima = s.rota?.[(s.etapa_atual ?? 0) + 1];
  const rotuloAprovar = direta ? 'Aprovar direto' : restam ? 'Assinar' : ultima ? 'Aprovar' : `Assinar e enviar: ${proxima?.nome}`;

  async function decidir(aprovar: boolean) {
    if (!aprovar && !obs.trim()) return setErro('Escreva o motivo da negativa.');
    if (direta && !obs.trim()) return setErro('Explique por que a Direção decide sem as assinaturas pendentes.');
    if (substituto && !vaga) return setErro('Escolha no lugar de quem você assina.');
    if (aprovar && pedeMotivo && !motivo) return setErro(`Informe por que ${ausenteDe} está ausente.`);
    if (aprovar && modo === 'justificado' && obs.trim().length < 5) return setErro('Escreva a justificativa para o pedido seguir só com a sua assinatura.');
    setErro(null);
    setOcupado(aprovar ? 'sim' : 'nao');
    const supabase = createClient();
    const a = await autorizarComSenha(supabase, senha);
    if (a.erro) { setOcupado(null); return setErro(a.erro); }
    const { data, error } = await supabase.rpc('assinar', {
      p_id: s.id, p_aprovar: aprovar, p_obs: modo === 'gozo' && aprovar ? null : obs.trim() || null,
      p_no_lugar_de: direta ? null : vaga || null,
      p_motivo_ausencia: pedeMotivo || (!aprovar && motivo) ? motivo || null : null,
      p_outra_ciente: aprovar && sozinho,
      p_token: a.token,
    });
    setOcupado(null);
    if (error) return setErro(mensagemErro(error));
    avisarMudanca();
    onFeito(
      !aprovar ? `Pedido de ${s.solicitante_nome} negado.`
        : data === 'Aprovado' ? `Pedido de ${s.solicitante_nome} aprovado.`
        : restam ? `Você assinou o pedido de ${s.solicitante_nome}. Faltam as outras assinaturas da etapa.`
        : `Pedido de ${s.solicitante_nome} assinado e enviado para: ${proxima?.nome ?? 'próxima etapa'}.`,
    );
  }

  const blocoAssinatura = (
    <div className="w-full">
      <CampoAssinatura id={`senha-${s.id}`} valor={senha} onChange={setSenha} compacto />
    </div>
  );

  if (negando) {
    return (
      <div className="w-full rounded-2xl border border-danger/25 bg-danger-light/50 p-4 sm:min-w-96">
        <label className="block text-xs font-semibold text-erro" htmlFor={`motivo-${s.id}`}>Motivo da negativa (a pessoa vai ver)</label>
        <textarea id={`motivo-${s.id}`} rows={2} value={obs} onChange={(e) => setObs(e.target.value)} autoFocus
          className={`${inputCls} mt-1`} />
        <div className="mt-3">{blocoAssinatura}</div>
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

  const escolhaVaga = (substituto && !regraUm && item.vagas.length > 1) || (titular && item.vagas.length > 1);
  return (
    <div className="w-full space-y-3">
      {et && (
        <p className="text-xs text-tinta-suave">
          {total > 1 ? `Etapa ${(s.etapa_atual ?? 0) + 1} de ${total}: ` : ''}<strong className="text-ink-charcoal">{et.nome}</strong>
          {' · '}{titular ? `você assina como ${item.rotulos.join(' / ')}` : substituto ? `você assina como ${rotuloVaga(et.substituto!)}` : 'decisão da Direção'}
        </p>
      )}
      {(substituto || podeGozo || direta || escolhaVaga) && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-warning/25 bg-warning-light/40 p-3.5 text-sm">
          {direta && (
            <div className="w-full space-y-2">
              <p className="text-warning">
                <strong>Decisão direta da Direção.</strong> Aprova ou nega sem esperar {falta(s)}
                {ultima ? '' : ' e as etapas seguintes'}. Use quando não houver quem assine.
              </p>
              <label className="block">
                <span className="text-xs font-semibold text-tinta-suave">Motivo (fica no histórico e no documento) *</span>
                <textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} className={`${inputCls} mt-1`}
                  placeholder="Ex.: unidade sem chefia nesta semana" />
              </label>
            </div>
          )}
          {substituto && (
            <p className="w-full text-warning">
              Você assina como substituto: só na ausência {regraUm && s.pendentes.length > 1 ? `de todos (${ausenteDe})` : 'do titular'} por férias ou afastamento médico.
            </p>
          )}
          {escolhaVaga && (
            <label className="flex min-w-56 flex-col gap-1">
              <span className="text-xs font-semibold text-tinta-suave">{substituto ? 'Assinar no lugar de' : 'Assinar como'}</span>
              <Escolha valor={vaga} onChange={setVaga} rotulo={substituto ? 'Assinar no lugar de' : 'Assinar como'} compacto
                opcoes={item.vagas.map((v, n) => ({
                  valor: v, rotulo: item.rotulos[n] || rotuloDe(v),
                  detalhe: item.ausentes.includes(v) ? 'ausência registrada' : undefined,
                }))} />
            </label>
          )}
          {podeGozo && (
            <label className="flex w-full items-start gap-2">
              <input type="checkbox" checked={modo === 'gozo'} onChange={(e) => setModo(e.target.checked ? 'gozo' : '')} className="mt-0.5 size-4 accent-electric-cobalt" />
              <span>
                <strong>Folga para gozo imediato:</strong> assinar sozinho(a). {outra ? rotuloDe(outra) : 'A outra chefia'} está ausente,
                houve consenso prévio e está ciente.
              </span>
            </label>
          )}
          {pedeMotivo && (
            <label className="flex min-w-56 flex-col gap-1">
              <span className="text-xs font-semibold text-tinta-suave">Por que {ausenteDe} está ausente? *</span>
              <Escolha valor={motivo} onChange={(v) => setMotivo(v as MotivoAusencia)} rotulo="Motivo da ausência" compacto placeholder="Escolha"
                opcoes={MOTIVOS_AUSENCIA.map((m) => ({ valor: m, rotulo: m }))} />
            </label>
          )}
          {!pedeMotivo && substituto && (
            <p className="text-xs text-tinta-suave">Ausência registrada no sistema: não é preciso declarar o motivo.</p>
          )}
        </div>
      )}
      {podeJustificar && (
        <div className={`rounded-2xl border p-3.5 text-sm ${modo === 'justificado' ? 'border-electric-cobalt/30 bg-lavender-mist/50' : 'border-linha bg-faint-gray/40'}`}>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={modo === 'justificado'} onChange={(e) => setModo(e.target.checked ? 'justificado' : '')}
              className="mt-0.5 size-4 accent-electric-cobalt" />
            <span>
              <strong>Seguir só com a minha assinatura</strong>
              <span className="block text-xs text-tinta-suave">O pedido não espera {outros || 'as outras assinaturas'}{ultima ? ' e é aprovado' : ` e vai para: ${proxima?.nome}`}. A justificativa fica no histórico e no documento.</span>
            </span>
          </label>
          {modo === 'justificado' && (
            <label className="mt-2 block">
              <span className="text-xs font-semibold text-tinta-suave">Justificativa *</span>
              <textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} className={`${inputCls} mt-1`}
                placeholder={`Ex.: ${outros || 'a outra chefia'} sem acesso ao sistema esta semana; combinado por telefone`} />
            </label>
          )}
        </div>
      )}
      {blocoAssinatura}
      {erro && <p role="alert" className="w-full text-right text-sm text-erro">{erro}</p>}
      <div className="flex flex-wrap justify-end gap-2">
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
