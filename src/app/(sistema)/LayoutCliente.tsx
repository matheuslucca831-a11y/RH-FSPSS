'use client';

import { Suspense } from 'react';
import { ProvedorPerfil, usePerfil } from '@/lib/contextoPerfil';
import Shell from '@/components/Shell';

function SistemaShell({ children }: { children: React.ReactNode }) {
  const { perfil } = usePerfil();
  return <Shell perfil={perfil}><Suspense fallback={null}>{children}</Suspense></Shell>;
}

export default function SistemaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProvedorPerfil>
      <SistemaShell>{children}</SistemaShell>
    </ProvedorPerfil>
  );
}
