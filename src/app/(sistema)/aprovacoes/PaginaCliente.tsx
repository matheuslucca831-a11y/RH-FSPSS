'use client';

import { Exige, usePerfil } from '@/lib/contextoPerfil';
import AprovacoesUnidade from '@/components/telas/AprovacoesUnidade';

export default function Pagina() {
  const { perfil } = usePerfil();
  return <Exige papeis={['chefia']}><AprovacoesUnidade usuarioId={perfil.id} unidadeId={perfil.unidade_id!} unidadeNome={perfil.unidade?.nome ?? 'sua unidade'} /></Exige>;
}
