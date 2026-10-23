'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ListChecks, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarSolicitacoes } from '@/lib/consultas';
import { SITUACOES_ABERTAS } from '@/lib/solicitacoes';
import { Aviso, Cabecalho, Segmentos } from '@/components/ui';
import ListaSolicitacoes from '@/components/solicitacoes/Lista';
import { AcaoCancelar } from '@/components/solicitacoes/Acoes';

type Visao = 'andamento' | 'finalizadas';
const VISOES = [['andamento', 'Em análise'], ['finalizadas', 'Finalizadas']] as const;

export default function MinhasSolicitacoes({ usuarioId }: { usuarioId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [visao, setVisao] = useState<Visao>('andamento');
  const [ok, setOk] = useState<string | null>(null);
  const { dados, erro, recarregar } = useConsulta(`minhas:${usuarioId}`, () =>
    buscarSolicitacoes(supabase, (q) => q.eq('solicitante_id', usuarioId)));

  const abertas = (dados ?? []).filter((s) => SITUACOES_ABERTAS.includes(s.situacao));
  const finalizadas = (dados ?? []).filter((s) => !SITUACOES_ABERTAS.includes(s.situacao));

  return (
    <div className="w-full">
      <Cabecalho icone={ListChecks} titulo="Minhas solicitações" descricao="Veja em que etapa está cada pedido que você fez.">
        <Link href="/nova" className="dock-btn-primary">
          <Plus className="size-4" aria-hidden /> Nova solicitação
        </Link>
      </Cabecalho>

      <div className="mt-6">
        <Segmentos rotulo="Situação" opcoes={VISOES} valor={visao} onChange={setVisao}
          contagem={{ andamento: abertas.length, finalizadas: finalizadas.length }} />
      </div>

      {erro && <div className="mt-4"><Aviso>{erro}</Aviso></div>}
      {ok && <div className="mt-4"><Aviso tom="info">{ok}</Aviso></div>}

      <div className="mt-4">
        <ListaSolicitacoes
          itens={dados && (visao === 'andamento' ? abertas : finalizadas)}
          vazio={visao === 'andamento'
            ? <>Nenhum pedido em análise. <Link href="/nova" className="font-semibold text-electric-cobalt underline">Fazer uma solicitação</Link></>
            : 'Nenhum pedido finalizado ainda.'}
          acoes={(s) => SITUACOES_ABERTAS.includes(s.situacao)
            ? <AcaoCancelar s={s} onFeito={(m) => { setOk(m); recarregar(); }} /> : null}
        />
      </div>
    </div>
  );
}
