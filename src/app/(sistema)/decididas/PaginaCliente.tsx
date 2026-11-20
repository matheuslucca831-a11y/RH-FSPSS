'use client';

import { Exige, usePerfil } from '@/lib/contextoPerfil';
import { TODOS } from '@/lib/rotas';
import MinhasAnalises from '@/components/telas/MinhasAnalises';

export default function Pagina() {
  const { perfil } = usePerfil();
  return (
    <Exige papeis={TODOS}>
      <MinhasAnalises usuarioId={perfil.id} comUnidade={['direcao', 'coordenacao', 'supervisor', 'diretor'].includes(perfil.papel)} />
    </Exige>
  );
}
