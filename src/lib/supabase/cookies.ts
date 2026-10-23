/**
 * Em desenvolvimento (StackBlitz), a prévia roda dentro de um iframe de outro domínio.
 * Os navegadores rejeitam cookies comuns (SameSite=Lax) nesse caso, e o login não fica salvo.
 * SameSite=None + Secure + Partitioned permite guardar a sessão dentro do iframe.
 * Em produção (Vercel) fica o padrão do Supabase, que é mais restritivo.
 */
export const opcoesCookie =
  process.env.NODE_ENV === 'development'
    ? { sameSite: 'none' as const, secure: true, partitioned: true }
    : undefined;
