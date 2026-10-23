'use client';

import { useMemo, useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarSolicitacoes } from '@/lib/consultas';
import { Aviso, Cabecalho, Segmentos } from '@/components/ui';
import ListaSolicitacoes from '@/components/solicitacoes/Lista';
import { AcoesDecisao } from '@/components/solicitacoes/Acoes';

type Visao = 'analisar' | 'direcao' | 'finalizadas';
const VISOES = [['analisar', 'Aguardando você'], ['direcao', 'Com a Direção'], ['finalizadas', 'Finalizadas']] as const;

/** Chefia: pedidos da equipe da unidade */
export default function AprovacoesUnidade({ usuarioId, unidadeId, unidadeNome }: { usuarioId: string; unidadeId: string; unidadeNome: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [visao, setVisao] = useState<Visao>('analisar');
  const [ok, setOk] = useState<string | null>(null);
  const { dados, erro, recarregar } = useConsulta(`unidade:${unidadeId}`, () =>
    buscarSolicitacoes(supabase, (q) => q.eq('unidade_id', unidadeId).neq('solicitante_id', usuarioId), true));

  const grupos = useMemo(() => {
    const d = dados ?? [];
    return {
      analisar: d.filter((s) => s.situacao === 'Aguardando chefia'),
      direcao: d.filter((s) => s.situacao === 'Aguardando direção'),
      finalizadas: d.filter((s) => !['Aguardando chefia', 'Aguardando direção'].includes(s.situacao)).reverse(),
    };
  }, [dados]);

  return (
    <div className="w-full">
      <Cabecalho icone={CheckSquare} titulo="Aprovações da unidade" descricao={`Pedidos da equipe de ${unidadeNome}. Os mais antigos aparecem primeiro.`} />

      <div className="mt-6">
        <Segmentos rotulo="Situação" opcoes={VISOES} valor={visao} onChange={setVisao}
          contagem={{ analisar: grupos.analisar.length, direcao: grupos.direcao.length }} />
      </div>

      {visao === 'analisar' && (
        <p className="mt-3 text-sm text-tinta-suave">
          Ajuste de ponto termina com a sua aprovação. Folga aprovada por você segue para a decisão da Direção.
        </p>
      )}

      {erro && <div className="mt-4"><Aviso>{erro}</Aviso></div>}
      {ok && <div className="mt-4"><Aviso tom="info">{ok}</Aviso></div>}

      <div className="mt-4">
        <ListaSolicitacoes
          itens={dados && grupos[visao]}
          mostrarSolicitante
          destaque={(s) => s.situacao === 'Aguardando chefia'}
          vazio={visao === 'analisar' ? 'Nada aguardando a sua análise. Tudo em dia!'
            : visao === 'direcao' ? 'Nenhuma folga da unidade aguardando a Direção.' : 'Nenhum pedido finalizado ainda.'}
          acoes={(s) => s.situacao === 'Aguardando chefia'
            ? <AcoesDecisao s={s} quem="chefia" onFeito={(m) => { setOk(m); recarregar(); }} /> : null}
        />
      </div>
    </div>
  );
}
