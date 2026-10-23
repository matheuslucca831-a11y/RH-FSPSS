'use client';

import { usePerfil } from '@/lib/contextoPerfil';
import MinhasSolicitacoes from '@/components/telas/MinhasSolicitacoes';

export default function Pagina() {
  const { perfil } = usePerfil();
  return <MinhasSolicitacoes usuarioId={perfil.id} />;
}
