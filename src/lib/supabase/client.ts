import { createBrowserClient } from '@supabase/ssr';
import { opcoesCookie } from './cookies';
import { normalizarUrl } from '@/lib/url';

/** Cliente para componentes 'use client' */
export function createClient() {
  return createBrowserClient(
    normalizarUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? 'https://configure-o-supabase.invalid',
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
    { cookieOptions: opcoesCookie }
  );
}
