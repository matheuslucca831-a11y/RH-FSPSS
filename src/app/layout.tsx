import type { Metadata, Viewport } from 'next';
import { normalizarUrl } from '@/lib/url';
import '@fontsource-variable/inter';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(normalizarUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? 'http://localhost:3000'),
  title: 'SIGER RH | Ajustes de ponto e folgas',
  description: 'Sistema Integrado de Gestão e Relatórios: Recursos Humanos | FSPSS e Secretaria de Saúde de São Sebastião',
  robots: { index: false, follow: false },
  referrer: 'strict-origin-when-cross-origin',
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', type: 'image/png' }],
  },
  openGraph: {
    title: 'SIGER RH | FSPSS',
    description: 'Ajustes de ponto e folgas | Fundação de Saúde Pública de São Sebastião',
    images: [{ url: '/og-image.png', width: 1080, height: 1080, alt: 'SIGER RH' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#004aad',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
