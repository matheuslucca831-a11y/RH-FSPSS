'use client';

import { Exige, usePerfil } from '@/lib/contextoPerfil';
import TodasSolicitacoes from '@/components/telas/TodasSolicitacoes';

export default function Pagina() {
  const { perfil } = usePerfil();
  return <Exige papeis={['direcao']}><TodasSolicitacoes usuarioId={perfil.id} /></Exige>;
}
