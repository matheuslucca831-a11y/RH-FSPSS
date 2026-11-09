'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProvedorPerfil } from '@/lib/contextoPerfil';
import Comprovante from '@/components/assinatura/Comprovante';

function ComId() {
  const id = useSearchParams().get('id');
  return <Comprovante id={id} />;
}

/** Comprovante fora do menu do sistema (fica limpo para imprimir), mas só para quem entrou */
export default function PaginaCliente() {
  return (
    <ProvedorPerfil>
      <Suspense fallback={null}><ComId /></Suspense>
    </ProvedorPerfil>
  );
}
