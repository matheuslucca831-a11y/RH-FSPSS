'use client';

import { usePerfil } from '@/lib/contextoPerfil';
import MinhaConta from '@/components/telas/MinhaConta';

export default function Pagina() {
  const { perfil } = usePerfil();
  return <MinhaConta perfil={perfil} />;
}
