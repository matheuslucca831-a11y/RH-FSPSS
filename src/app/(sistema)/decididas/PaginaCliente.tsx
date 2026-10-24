'use client';

import { Exige, usePerfil } from '@/lib/contextoPerfil';
import { ASSINAM } from '@/lib/types';
import MinhasAnalises from '@/components/telas/MinhasAnalises';

export default function Pagina() {
  const { perfil } = usePerfil();
  return (
    <Exige papeis={ASSINAM}>
      <MinhasAnalises usuarioId={perfil.id} comUnidade={['direcao', 'coordenacao', 'supervisor'].includes(perfil.papel)} />
    </Exige>
  );
}
