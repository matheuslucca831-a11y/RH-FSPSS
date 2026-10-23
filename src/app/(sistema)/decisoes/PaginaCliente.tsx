'use client';

import { Exige, usePerfil } from '@/lib/contextoPerfil';
import DecisaoDirecao from '@/components/telas/DecisaoDirecao';

export default function Pagina() {
  const { perfil } = usePerfil();
  return <Exige papeis={['direcao']}><DecisaoDirecao usuarioId={perfil.id} /></Exige>;
}
