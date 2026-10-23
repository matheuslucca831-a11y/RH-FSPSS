'use client';

import { usePerfil } from '@/lib/contextoPerfil';
import Inicio from '@/components/telas/Inicio';

export default function Pagina() {
  const { perfil } = usePerfil();
  return <Inicio perfil={perfil} />;
}
