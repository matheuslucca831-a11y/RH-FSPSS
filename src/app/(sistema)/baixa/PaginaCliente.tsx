'use client';

import { Exige } from '@/lib/contextoPerfil';
import BaixaRH from '@/components/telas/BaixaRH';

export default function Pagina() {
  return <Exige papeis={['rh', 'direcao']}><BaixaRH /></Exige>;
}
