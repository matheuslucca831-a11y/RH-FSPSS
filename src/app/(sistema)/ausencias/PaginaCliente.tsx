'use client';

import { Exige, usePerfil } from '@/lib/contextoPerfil';
import { ASSINAM } from '@/lib/types';
import Ausencias from '@/components/telas/Ausencias';

export default function Pagina() {
  const { perfil } = usePerfil();
  return <Exige papeis={ASSINAM}><Ausencias perfil={perfil} /></Exige>;
}
