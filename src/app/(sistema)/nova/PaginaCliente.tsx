'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePerfil } from '@/lib/contextoPerfil';
import NovaSolicitacao from '@/components/nova/NovaSolicitacao';

function Nova() {
  const { perfil } = usePerfil();
  const tipo = useSearchParams().get('tipo');
  return <NovaSolicitacao key={tipo ?? 'ponto'} usuarioId={perfil.id} papel={perfil.papel} categoriaInicial={tipo === 'folga' ? 'folga' : 'ponto'} />;
}

export default function Pagina() {
  return <Suspense fallback={null}><Nova /></Suspense>;
}
