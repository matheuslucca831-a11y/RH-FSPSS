'use client';

import { useState } from 'react';
import { Building2, FileSearch, GitBranch, Settings, ShieldCheck, Users } from 'lucide-react';
import { Abas, Cabecalho } from '@/components/ui';
import AdminUsuarios from './AdminUsuarios';
import AdminFluxos from './AdminFluxos';
import AdminUnidades from './AdminUnidades';
import AdminSeguranca from './AdminSeguranca';
import AdminAuditoria from './AdminAuditoria';

const ABAS = [
  ['usuarios', 'Usuários', Users],
  ['fluxos', 'Fluxos de assinatura', GitBranch],
  ['unidades', 'Unidades', Building2],
  ['seguranca', 'Segurança', ShieldCheck],
  ['auditoria', 'Auditoria', FileSearch],
] as const;
type Aba = (typeof ABAS)[number][0];

export default function Administracao({ meuId }: { meuId: string }) {
  const [aba, setAba] = useState<Aba>('usuarios');
  return (
    <div className="w-full space-y-6">
      <Cabecalho icone={Settings} titulo="Administração" descricao="Acessos, fluxos de assinatura, unidades, regras de segurança e auditoria do SIGER RH." />
      <Abas rotulo="Seções da administração" abas={ABAS} valor={aba} onChange={setAba} />
      <div>
        {aba === 'usuarios' && <AdminUsuarios meuId={meuId} />}
        {aba === 'fluxos' && <AdminFluxos />}
        {aba === 'unidades' && <AdminUnidades />}
        {aba === 'seguranca' && <AdminSeguranca />}
        {aba === 'auditoria' && <AdminAuditoria />}
      </div>
    </div>
  );
}
