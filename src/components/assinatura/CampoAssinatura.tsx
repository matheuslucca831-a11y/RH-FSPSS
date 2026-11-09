'use client';

import { KeyRound, ShieldCheck } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Confere a senha e devolve uma autorização de uso único (2 minutos) para assinar.
 * A senha não é gravada em lugar nenhum.
 */
export async function autorizarComSenha(supabase: SupabaseClient, senha: string): Promise<{ token: string | null; erro?: string }> {
  if (!senha) return { token: null, erro: 'Digite a sua senha para assinar.' };
  const { data, error } = await supabase.rpc('confirmar_senha', { p_senha: senha });
  if (error) return { token: null, erro: error.message };
  if (!data) return { token: null, erro: 'Senha incorreta.' };
  return { token: data as string };
}

/** Campo de senha para assinar (enviar, aprovar ou negar) */
export default function CampoAssinatura({ valor, onChange, compacto = false, id }: {
  valor: string; onChange: (senha: string) => void; compacto?: boolean; id: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-semibold text-tinta-suave">
        <KeyRound className="size-3.5" aria-hidden /> Confirme com a sua senha para assinar *
      </label>
      <input id={id} type="password" autoComplete="current-password" value={valor} onChange={(e) => onChange(e.target.value)}
        placeholder="Sua senha de acesso" maxLength={72}
        className="w-full max-w-sm rounded-xl border border-linha bg-white px-4 py-2.5 text-sm outline-none focus:border-electric-cobalt focus:ring-2 focus:ring-electric-cobalt/20" />
      {!compacto && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-tinta-suave">
          <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
          Assinatura eletrônica (Lei nº 14.063/2020): ficam registrados o seu login, a data e a hora, o aparelho e o código do documento.
          A senha não é guardada. O documento assinado pode ser conferido pelo QR code.
        </p>
      )}
    </div>
  );
}
