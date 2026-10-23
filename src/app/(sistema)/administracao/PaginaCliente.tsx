'use client';

import { Exige, usePerfil } from '@/lib/contextoPerfil';
import Administracao from '@/components/admin/Administracao';

export default function Pagina() {
  const { perfil } = usePerfil();
  return <Exige papeis={['direcao']}><Administracao meuId={perfil.id} /></Exige>;
}
