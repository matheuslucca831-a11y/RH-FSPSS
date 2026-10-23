'use client';

import { Exige } from '@/lib/contextoPerfil';
import Relatorios from '@/components/telas/Relatorios';

export default function Pagina() {
  return <Exige papeis={['direcao']}><Relatorios /></Exige>;
}
