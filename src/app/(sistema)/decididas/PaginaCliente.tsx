'use client';

import { Exige, usePerfil } from '@/lib/contextoPerfil';
import MinhasAnalises from '@/components/telas/MinhasAnalises';

export default function Pagina() {
  const { perfil } = usePerfil();
  return <Exige papeis={['chefia', 'direcao']}><MinhasAnalises usuarioId={perfil.id} direcao={perfil.papel === 'direcao'} /></Exige>;
}
