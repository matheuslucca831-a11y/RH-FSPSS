'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { dataHoraBR, mensagemErro } from '@/lib/formato';
import { Aviso, Botao, Campo, inputCls } from '@/components/ui';

type Config = {
  exigir_mfa_direcao: boolean; exigir_mfa_chefia: boolean; minutos_inatividade: number; limite_pedidos_dia: number; atualizado_em: string;
};

export default function AdminSeguranca() {
  const supabase = useMemo(() => createClient(), []);
  const [c, setC] = useState<Config | null>(null);
  const [original, setOriginal] = useState<Config | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    supabase.from('seguranca_config').select('exigir_mfa_direcao, exigir_mfa_chefia, minutos_inatividade, limite_pedidos_dia, atualizado_em')
      .maybeSingle().then(({ data, error }) => {
        if (error) setErro(mensagemErro(error));
        setC(data as Config);
        setOriginal(data as Config);
      });
  }, [supabase]);

  async function salvar() {
    if (!c) return;
    if (original?.exigir_mfa_direcao && !c.exigir_mfa_direcao
      && !window.confirm('Desligar a verificação em duas etapas da Direção deixa os dados mais expostos se uma senha vazar. Continuar?')) return;
    setOcupado(true);
    const { data, error } = await supabase.from('seguranca_config').update({
      exigir_mfa_direcao: c.exigir_mfa_direcao, exigir_mfa_chefia: c.exigir_mfa_chefia,
      minutos_inatividade: c.minutos_inatividade, limite_pedidos_dia: c.limite_pedidos_dia,
    }).eq('id', true).select('exigir_mfa_direcao, exigir_mfa_chefia, minutos_inatividade, limite_pedidos_dia, atualizado_em').maybeSingle();
    setOcupado(false);
    if (error) return setErro(mensagemErro(error));
    setC(data as Config);
    setOriginal(data as Config);
    setErro(null);
    setOk('Configuração salva e registrada na auditoria. Vale a partir do próximo acesso de cada pessoa.');
  }

  if (!c) return <div className="dock-card p-10 text-center text-sm text-slate-gray">{erro ?? 'Carregando'}</div>;

  return (
    <div className="space-y-5">
      <div className="dock-card flex items-center gap-4 p-5 sm:p-6">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-electric-cobalt text-white shadow-xs"><ShieldCheck className="size-6" aria-hidden /></div>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-ink-charcoal">Segurança do acesso</h2>
          <p className="mt-0.5 text-xs text-slate-gray">Estas regras são aplicadas pelo banco de dados, não só pela tela. Toda mudança fica na auditoria.</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="dock-card space-y-4 p-5 sm:p-6">
          <h3 className="text-base font-semibold text-ink-charcoal">Verificação em duas etapas</h3>
          <Chave rotulo="Obrigatória para a Direção" dica="Recomendado. A Direção vê os pedidos e comprovantes de todas as unidades."
            valor={c.exigir_mfa_direcao} onChange={(v) => setC({ ...c, exigir_mfa_direcao: v })} />
          <Chave rotulo="Obrigatória para a Chefia" dica="A chefia vê os pedidos e atestados da equipe da unidade."
            valor={c.exigir_mfa_chefia} onChange={(v) => setC({ ...c, exigir_mfa_chefia: v })} />
        </section>

        <section className="dock-card space-y-4 p-5 sm:p-6">
          <h3 className="text-base font-semibold text-ink-charcoal">Sessão e limites</h3>
          <Campo rotulo="Encerrar a sessão depois de quantos minutos sem uso" dica="Entre 5 e 480 minutos.">
            <input type="number" min={5} max={480} value={c.minutos_inatividade}
              onChange={(e) => setC({ ...c, minutos_inatividade: Math.min(480, Math.max(5, Number(e.target.value) || 5)) })} className={inputCls} />
          </Campo>
          <Campo rotulo="Máximo de pedidos por pessoa em 24 horas" dica="Freio contra envio em massa. Entre 1 e 200.">
            <input type="number" min={1} max={200} value={c.limite_pedidos_dia}
              onChange={(e) => setC({ ...c, limite_pedidos_dia: Math.min(200, Math.max(1, Number(e.target.value) || 1)) })} className={inputCls} />
          </Campo>
        </section>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tom="info">{ok}</Aviso>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-gray">Última alteração: {dataHoraBR(c.atualizado_em)}</p>
        <Botao carregando={ocupado} onClick={salvar}>Salvar configuração</Botao>
      </div>
    </div>
  );
}

function Chave({ rotulo, dica, valor, onChange }: { rotulo: string; dica: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-ink-charcoal">{rotulo}</span>
        <span className="block text-xs text-slate-gray">{dica}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" role="switch" checked={valor} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-linha transition-colors peer-checked:bg-electric-cobalt peer-focus-visible:ring-2 peer-focus-visible:ring-electric-cobalt/40" />
        <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-xs transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
