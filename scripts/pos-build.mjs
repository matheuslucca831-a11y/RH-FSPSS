// =====================================================================
// SIGER RH | pós-build do site estático (pasta out/)
// 1. Coloca em cada página uma Política de Segurança de Conteúdo (CSP) com o
//    hash exato de cada script da própria página: script injetado não roda.
// 2. Copia o .htaccess (HTTPS, cabeçalhos de segurança, URLs limpas).
// =====================================================================
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const out = join(raiz, 'out');
if (!existsSync(out)) throw new Error('Pasta out/ não encontrada. Rode "next build" antes.');

// Lê o endereço do Supabase das variáveis ou dos arquivos .env
function variavel(nome) {
  if (process.env[nome]) return process.env[nome];
  for (const arq of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    const p = join(raiz, arq);
    if (!existsSync(p)) continue;
    const linha = readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${nome}=`));
    if (linha) return linha.slice(nome.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}
const supabase = variavel('NEXT_PUBLIC_SUPABASE_URL');
if (!supabase) throw new Error('NEXT_PUBLIC_SUPABASE_URL não definida (.env.local ou variável de ambiente).');
let u;
try {
  u = new URL(/^https?:\/\//i.test(supabase.trim()) ? supabase.trim() : `https://${supabase.trim()}`);
} catch {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL inválida. Use o endereço completo, por exemplo https://abcdefgh.supabase.co');
}
const conexoes = [`${u.origin}`, `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`];

function politica(hashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.map((h) => `'sha256-${h}'`).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${u.origin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${conexoes.join(' ')}`,
    "frame-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(u.protocol === 'https:' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

const paginas = [];
(function andar(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) andar(p);
    else if (nome.endsWith('.html')) paginas.push(p);
  }
})(out);

let total = 0;
for (const p of paginas) {
  let html = readFileSync(p, 'utf8');
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/g, '');
  const hashes = new Set();
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (m[1].length) hashes.add(createHash('sha256').update(m[1], 'utf8').digest('base64'));
  }
  const meta = `<meta http-equiv="Content-Security-Policy" content="${politica([...hashes])}"/>`;
  if (!html.includes('<head>')) throw new Error(`Página sem <head>: ${p}`);
  html = html.replace('<head>', `<head>${meta}`);
  writeFileSync(p, html);
  total++;
}

// Mapas de código nunca vão para o servidor
(function semMapas(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) semMapas(p);
    else if (nome.endsWith('.map')) rmSync(p);
  }
})(out);

copyFileSync(join(raiz, 'hospedagem', '.htaccess'), join(out, '.htaccess'));
console.log(`SIGER RH: CSP aplicada em ${total} páginas (Supabase: ${u.origin}). .htaccess copiado.`);
