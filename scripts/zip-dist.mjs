/**
 * Genera un ZIP del contenido de `dist/` para subir a Hostinger (un solo archivo).
 * Uso: npm run build && npm run zip:dist
 *
 * Escribe el ZIP a mano (método STORE, sin compresión) INCLUYENDO entradas de
 * directorio. Es importante: el extractor del Administrador de archivos de
 * Hostinger NO crea las carpetas si el ZIP no trae esas entradas explícitas
 * (deja los archivos sueltos en la raíz y la tienda queda en blanco). Además usa
 * separadores "/" (no "\") para que extraiga bien en Linux.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const outZip = path.join(root, "tradexpar-dist.zip");

if (!fs.existsSync(distDir)) {
  console.error("[zip-dist] No existe dist/. Ejecutá antes: npm run build");
  process.exit(1);
}

// CRC-32 (IEEE) — requerido por el formato ZIP.
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Recorre dist/ y junta carpetas (con "/" al final) y archivos, rutas relativas con "/". */
const dirs = [];
const files = [];
function walk(abs, rel) {
  for (const name of fs.readdirSync(abs)) {
    const a = path.join(abs, name);
    const r = rel ? `${rel}/${name}` : name;
    if (fs.statSync(a).isDirectory()) {
      dirs.push(`${r}/`);
      walk(a, r);
    } else {
      files.push({ rel: r, data: fs.readFileSync(a) });
    }
  }
}
walk(distDir, "");

const DOS_DATE = 0x0021; // 1980-01-01
const DOS_TIME = 0;
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n >>> 0); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

const localChunks = [];
const central = [];
let offset = 0;

function addEntry(name, data, isDir) {
  const nameBuf = Buffer.from(name, "utf8");
  const crc = isDir ? 0 : crc32(data);
  const size = isDir ? 0 : data.length;
  const extAttr = isDir ? (((0o40755 << 16) >>> 0) | 0x10) >>> 0 : (0o100644 << 16) >>> 0;
  const localHeader = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(0), u16(DOS_TIME), u16(DOS_DATE),
    u32(crc), u32(size), u32(size), u16(nameBuf.length), u16(0), nameBuf,
  ]);
  localChunks.push(localHeader);
  if (!isDir) localChunks.push(data);
  const localOffset = offset;
  offset += localHeader.length + (isDir ? 0 : size);
  central.push(Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(DOS_TIME), u16(DOS_DATE),
    u32(crc), u32(size), u32(size), u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0),
    u32(extAttr), u32(localOffset), nameBuf,
  ]));
}

for (const d of dirs) addEntry(d, null, true);
for (const f of files) addEntry(f.rel, f.data, false);

const centralBuf = Buffer.concat(central);
const centralOffset = offset;
const total = dirs.length + files.length;
const eocd = Buffer.concat([
  u32(0x06054b50), u16(0), u16(0), u16(total), u16(total),
  u32(centralBuf.length), u32(centralOffset), u16(0),
]);

try { fs.unlinkSync(outZip); } catch { /* no existe */ }
fs.writeFileSync(outZip, Buffer.concat([...localChunks, centralBuf, eocd]));

const mb = (fs.statSync(outZip).size / (1024 * 1024)).toFixed(2);
console.log(`[zip-dist] Creado: ${outZip} (${mb} MB) — ${dirs.length} carpetas, ${files.length} archivos`);
console.log("[zip-dist] En Hostinger: subí el ZIP → extraer en public_html del dominio tradexpar.com.py.");
