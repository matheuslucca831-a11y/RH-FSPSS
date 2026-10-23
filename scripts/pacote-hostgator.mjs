// Gera SIGER-RH-HostGator.zip com o conteúdo de out/ (extrair na pasta do subdomínio)
import { deflateRawSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const out = join(raiz, 'out');
const arquivos = [];
(function andar(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) andar(p); else arquivos.push(p);
  }
})(out);

const tabela = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = tabela[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

const partes = []; const central = []; let pos = 0;
for (const p of arquivos) {
  const nome = Buffer.from(relative(out, p).split('\\').join('/'));
  const dados = readFileSync(p); const comp = deflateRawSync(dados, { level: 9 }); const crc = crc32(dados);
  const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(8, 8);
  loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(dados.length, 22); loc.writeUInt16LE(nome.length, 26);
  partes.push(loc, nome, comp);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(8, 10); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(dados.length, 24);
  cen.writeUInt16LE(nome.length, 28); cen.writeUInt32LE(pos, 42);
  central.push(cen, nome);
  pos += 30 + nome.length + comp.length;
}
const cd = Buffer.concat(central);
const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(pos, 16);
const destino = join(raiz, 'SIGER-RH-HostGator.zip');
writeFileSync(destino, Buffer.concat([...partes, cd, fim]));
console.log(`Pacote pronto: ${destino} (${arquivos.length} arquivos). Extraia na pasta do subdomínio (ex.: public_html/sigerrh).`);
