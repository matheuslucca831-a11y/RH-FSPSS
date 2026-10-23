'use client';

import { useMemo } from 'react';
import { History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarSolicitacoes } from '@/lib/consultas';
import { Aviso, Cabecalho } from '@/components/ui';
import ListaSolicitacoes from '@/components/solicitacoes/Lista';

/** Chefia e Direção: o que esta pessoa aprovou ou negou */
export default function MinhasAnalises({ usuarioId, direcao }: { usuarioId: string; direcao: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const { dados, erro } = useConsulta(`analises:${usuarioId}`, () =>
    buscarSolicitacoes(supabase, (q) => q.or(`chefia_por.eq.${usuarioId},direcao_por.eq.${usuarioId}`)));

  return (
    <div className="w-full">
      <Cabecalho icone={History} titulo="Minhas análises" descricao="Pedidos que você aprovou ou negou, dos mais recentes para os mais antigos." />
      {erro && <div className="mt-4"><Aviso>{erro}</Aviso></div>}
      <div className="mt-6">
        <ListaSolicitacoes itens={dados} mostrarSolicitante comUnidade={direcao} vazio="Você ainda não analisou nenhum pedido." />
      </div>
    </div>
  );
}
