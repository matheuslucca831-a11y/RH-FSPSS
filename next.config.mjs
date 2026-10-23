/** @type {import('next').NextConfig} */
const nextConfig = {
  // Site estático (HostGator / qualquer hospedagem de arquivos). A segurança fica no Supabase (RLS).
  output: 'export',
  images: { unoptimized: true },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // O lint roda no editor; não deixa o deploy falhar por causa dele
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
