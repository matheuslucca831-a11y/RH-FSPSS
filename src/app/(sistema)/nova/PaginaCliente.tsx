'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePerfil } from '@/lib/contextoPerfil';
import { CATEGORIAS, type Categoria } from '@/lib/solicitacoes';
import NovaSolicitacao from '@/components/nova/NovaSolicitacao';

function Nova() {
  const { perfil } = usePerfil();
  const tipo = useSearchParams().get('tipo');
  const inicial: Categoria = tipo && tipo in CATEGORIAS ? (tipo as Categoria) : 'ponto';
  return <NovaSolicitacao key={inicial} perfil={perfil} categoriaInicial={inicial} />;
}

export default function Pagina() {
  return <Suspense fallback={null}><Nova /></Suspense>;
}
