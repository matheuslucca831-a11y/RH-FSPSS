'use client';

import { useMemo, useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useConsulta } from '@/lib/cacheTela';
import { buscarSolicitacoes } from '@/lib/consultas';
import { buscarFila } from '@/lib/fila';
import { emAnalise } from '@/lib/solicitacoes';
import { PAPEIS, type Perfil } from '@/lib/types';
import { Aviso, Cabecalho, Segmentos } from '@/components/ui';
import ListaSolicitacoes from '@/components/solicitacoes/Lista';
import { AcoesAssinatura } from '@/components/solicitacoes/Acoes';

type Visao = 'voce' | 'substituir' | 'andamento' | 'finalizadas';

const EXPLICA: Record<string, string> = {
  enfermeiro: 'Cargos gerais: o pedido precisa da sua assinatura e da do Gerente. Saída antecipada e estágio: só a sua.',
  gerente: 'Cargos gerais: a sua assinatura e a do Enfermeiro responsável. Enfermeiros: só a sua. Em saída antecipada e estágio, você assina só na ausência do Enfermeiro.',
  supervisor: 'Você assina no lugar do Enfermeiro ou do Gerente em férias ou afastamento médico. Com a ausência registrada, o pedido aparece em "Aguardando você"; sem registro, em "Substituição", declarando o motivo.',
  coordenacao: 'Pedidos dos Gerentes de unidade e transferências de lotação. Folgas, férias e cancelamentos seguem depois para a Direção.',
  direcao: 'Decisão final de folgas, férias e cancelamentos já assinados pela unidade, e transferências de lotação.',
};

/** Tudo o que espera a assinatura de quem está usando, conforme a Circular 254/2026 */
export default function ParaAssinar({ perfil }: { perfil: Perfil }) {
  const supabase = useMemo(() => createClient(), []);
  const [visao, setVisao] = useState<Visao>('voce');
  const [ok, setOk] = useState<string | null>(null);
  const gestao = perfil.papel === 'direcao' || perfil.papel === 'coordenacao';

  const { dados, erro, recarregar } = useConsulta(`assinar:${perfil.id}`, async () => {
    const [fila, lista] = await Promise.all([
      buscarFila(supabase),
      // Direção e Coordenação veem tudo: aqui só o que está em análise. Chefias: a unidade inteira.
      buscarSolicitacoes(supabase, (q) => {
        const base = q.neq('solicitante_id', perfil.id);
        return gestao ? base.like('situacao', 'Aguardando%') : base;
      }, true),
    ]);
    return { fila, lista };
  });

  const grupos = useMemo(() => {
    const fila = new Map((dados?.fila ?? []).map((i) => [i.id, i]));
    const l = dados?.lista ?? [];
    return {
      fila,
      voce: l.filter((s) => fila.get(s.id) && !fila.get(s.id)!.precisa_motivo),
      substituir: l.filter((s) => fila.get(s.id)?.precisa_motivo),
      andamento: l.filter((s) => emAnalise(s) && !fila.has(s.id)),
      finalizadas: l.filter((s) => !emAnalise(s)).reverse(),
    };
  }, [dados]);

  const temSubstituicao = perfil.papel === 'supervisor' || perfil.papel === 'gerente' || grupos.substituir.length > 0;
  const VISOES = [
    ['voce', 'Aguardando você'] as const,
    ...(temSubstituicao ? [['substituir', 'Substituição'] as const] : []),
    ['andamento', 'Em andamento'] as const,
    ...(!gestao ? [['finalizadas', 'Finalizadas'] as const] : []),
  ];

  return (
    <div className="w-full">
      <Cabecalho icone={CheckSquare} titulo="Para assinar"
        descricao={`${PAPEIS[perfil.papel].rotulo}${perfil.unidade?.nome && !gestao ? ` | ${perfil.unidade.nome}` : ''}. Os pedidos mais antigos aparecem primeiro.`} />

      <div className="mt-6">
        <Segmentos rotulo="Situação" opcoes={VISOES} valor={visao} onChange={setVisao}
          contagem={{ voce: grupos.voce.length, substituir: grupos.substituir.length, andamento: grupos.andamento.length }} />
      </div>

      <p className="mt-3 text-sm text-tinta-suave">
        {visao === 'substituir'
          ? 'Pedidos em que a chefia titular não tem ausência registrada. Para assinar no lugar dela, declare o motivo (férias ou afastamento médico); isso fica no histórico.'
          : visao === 'andamento' ? 'Pedidos que esperam outra assinatura (da outra chefia, da Coordenação ou da Direção).'
          : EXPLICA[perfil.papel] ?? ''}
      </p>

      {erro && <div className="mt-4"><Aviso>{erro}</Aviso></div>}
      {ok && <div className="mt-4"><Aviso tom="info">{ok}</Aviso></div>}

      <div className="mt-4">
        <ListaSolicitacoes
          itens={dados && grupos[visao]}
          mostrarSolicitante
          comUnidade={gestao || perfil.papel === 'supervisor'}
          destaque={(s) => grupos.fila.has(s.id) && visao === 'voce'}
          vazio={visao === 'voce' ? 'Nada aguardando a sua assinatura. Tudo em dia!'
            : visao === 'substituir' ? 'Nenhum pedido para assinar como substituto.'
            : visao === 'andamento' ? 'Nenhum pedido esperando outra assinatura.' : 'Nenhum pedido finalizado ainda.'}
          acoes={(s) => {
            const item = grupos.fila.get(s.id);
            return item && (visao === 'voce' || visao === 'substituir')
              ? <AcoesAssinatura s={s} item={item} onFeito={(m) => { setOk(m); recarregar(); }} /> : null;
          }}
        />
      </div>
    </div>
  );
}
