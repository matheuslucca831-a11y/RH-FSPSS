'use client';

import { Exige, usePerfil } from '@/lib/contextoPerfil';
import { ASSINAM } from '@/lib/types';
import ParaAssinar from '@/components/telas/ParaAssinar';

export default function Pagina() {
  const { perfil } = usePerfil();
  return <Exige papeis={ASSINAM}><ParaAssinar perfil={perfil} /></Exige>;
}
