'use client';

import { useMemo, useState } from 'react';
import { Gavel } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarSolicitacoes } from '@/lib/consultas';
import { Aviso, Cabecalho, Segmentos } from '@/components/ui';
import ListaSolicitacoes from '@/components/solicitacoes/Lista';
import { AcoesDecisao } from '@/components/solicitacoes/Acoes';

type Visao = 'direcao' | 'chefia';
const VISOES = [['direcao', 'Aguardando a Direção'], ['chefia', 'Ainda na chefia']] as const;

/** Direção: decisão final das folgas (e pedidos que vieram direto) */
export default function DecisaoDirecao({ usuarioId }: { usuarioId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [visao, setVisao] = useState<Visao>('direcao');
  const [ok, setOk] = useState<string | null>(null);
  const { dados, erro, recarregar } = useConsulta('decisoes', () =>
    buscarSolicitacoes(supabase, (q) => q.in('situacao', ['Aguardando direção', 'Aguardando chefia']).neq('solicitante_id', usuarioId), true));

  const grupos = useMemo(() => ({
    direcao: (dados ?? []).filter((s) => s.situacao === 'Aguardando direção'),
    chefia: (dados ?? []).filter((s) => s.situacao === 'Aguardando chefia'),
  }), [dados]);

  return (
    <div className="w-full">
      <Cabecalho icone={Gavel} titulo="Decisão da Direção" descricao="Folgas já aprovadas pela chefia e pedidos enviados direto à Direção. Os mais antigos primeiro." />

      <div className="mt-6">
        <Segmentos rotulo="Etapa" opcoes={VISOES} valor={visao} onChange={setVisao}
          contagem={{ direcao: grupos.direcao.length, chefia: grupos.chefia.length }} />
      </div>
      {visao === 'chefia' && (
        <p className="mt-3 rounded-xl border border-warning/20 bg-warning-light px-4 py-2.5 text-sm text-warning">
          Estes pedidos ainda esperam a chefia da unidade. Se for preciso, a Direção pode decidir direto, e isso fica registrado no histórico.
        </p>
      )}

      {erro && <div className="mt-4"><Aviso>{erro}</Aviso></div>}
      {ok && <div className="mt-4"><Aviso tom="info">{ok}</Aviso></div>}

      <div className="mt-4">
        <ListaSolicitacoes
          itens={dados && grupos[visao]}
          mostrarSolicitante
          comUnidade
          destaque={(s) => s.situacao === 'Aguardando direção'}
          vazio={visao === 'direcao' ? 'Nada aguardando a decisão da Direção. Tudo em dia!' : 'Nenhum pedido parado na chefia.'}
          acoes={(s) => <AcoesDecisao s={s} quem="direcao" onFeito={(m) => { setOk(m); recarregar(); }} />}
        />
      </div>
    </div>
  );
}
