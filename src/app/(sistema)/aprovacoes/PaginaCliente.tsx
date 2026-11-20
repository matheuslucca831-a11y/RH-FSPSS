'use client';

import { Exige, usePerfil } from '@/lib/contextoPerfil';
import { TODOS } from '@/lib/rotas';
import ParaAssinar from '@/components/telas/ParaAssinar';

export default function Pagina() {
  const { perfil } = usePerfil();
  return <Exige papeis={TODOS}><ParaAssinar perfil={perfil} /></Exige>;
}
