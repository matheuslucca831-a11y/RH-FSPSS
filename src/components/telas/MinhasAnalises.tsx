'use client';

import { useMemo } from 'react';
import { History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarSolicitacoes } from '@/lib/consultas';
import { Aviso, Cabecalho } from '@/components/ui';
import ListaSolicitacoes from '@/components/solicitacoes/Lista';

/** Quem assina: os pedidos que esta pessoa assinou ou negou */
export default function MinhasAnalises({ usuarioId, comUnidade }: { usuarioId: string; comUnidade: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const { dados, erro } = useConsulta(`analises:${usuarioId}`, async () => {
    const { data, error } = await supabase.from('assinaturas').select('solicitacao_id')
      .eq('por', usuarioId).order('criado_em', { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    const ids = [...new Set((data ?? []).map((a) => a.solicitacao_id as string))];
    if (!ids.length) return [];
    const partes = await Promise.all(Array.from({ length: Math.ceil(ids.length / 150) }, (_, i) =>
      buscarSolicitacoes(supabase, (q) => q.in('id', ids.slice(i * 150, i * 150 + 150)))));
    return partes.flat().sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  });

  return (
    <div className="w-full">
      <Cabecalho icone={History} titulo="Minhas assinaturas" descricao="Pedidos que você assinou ou negou, dos mais recentes para os mais antigos." />
      {erro && <div className="mt-4"><Aviso>{erro}</Aviso></div>}
      <div className="mt-6">
        <ListaSolicitacoes itens={dados} mostrarSolicitante comUnidade={comUnidade} vazio="Você ainda não assinou nenhum pedido." />
      </div>
    </div>
  );
}
