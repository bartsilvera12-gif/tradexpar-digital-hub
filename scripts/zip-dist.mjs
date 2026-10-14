/**
 * Genera un ZIP del contenido de `dist/` para subir a Hostinger (un solo archivo).
 * Uso: npm run build && npm run zip:dist
 */
import { execFileSync } from "node:child_process";
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

const items = fs.readdirSync(distDir);
if (items.length === 0) {
  console.error("[zip-dist] dist/ está vacío.");
  process.exit(1);
}

try {
  fs.unlinkSync(outZip);
} catch {
  /* no existe */
}

/**
 * `Compress-Archive` de Windows PowerShell guarda las rutas con `\` (backslash),
 * lo que viola el spec ZIP y hace que al extraer en Linux (Hostinger) NO se creen
 * las carpetas (quedan archivos llamados "assets\x.js" en vez de "assets/x.js") →
 * la tienda queda en blanco. Reescribimos los separadores a `/` SOLO en los campos
 * de nombre (local headers + central directory), sin tocar el contenido.
 */
function normalizeZipSlashes(zipPath) {
  const b = fs.readFileSync(zipPath);
  const BS = 0x5c, FS = 0x2f;
  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP sin End-Of-Central-Directory");
  const total = b.readUInt16LE(eocd + 10);
  let cd = b.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (!(b[cd] === 0x50 && b[cd + 1] === 0x4b && b[cd + 2] === 0x01 && b[cd + 3] === 0x02)) {
      throw new Error(`Central directory corrupto en ${cd}`);
    }
    const fnLen = b.readUInt16LE(cd + 28);
    const extraLen = b.readUInt16LE(cd + 30);
    const commentLen = b.readUInt16LE(cd + 32);
    const localOff = b.readUInt32LE(cd + 42);
    const fnStart = cd + 46;
    for (let j = fnStart; j < fnStart + fnLen; j++) if (b[j] === BS) b[j] = FS;
    if (b[localOff] === 0x50 && b[localOff + 1] === 0x4b && b[localOff + 2] === 0x03 && b[localOff + 3] === 0x04) {
      const lfnLen = b.readUInt16LE(localOff + 26);
      const lfnStart = localOff + 30;
      for (let j = lfnStart; j < lfnStart + lfnLen; j++) if (b[j] === BS) b[j] = FS;
    }
    cd = fnStart + fnLen + extraLen + commentLen;
  }
  fs.writeFileSync(zipPath, b);
}

if (process.platform === "win32") {
  const src = `${distDir}\\*`;
  const cmd = `Compress-Archive -Path '${src.replace(/'/g, "''")}' -DestinationPath '${outZip.replace(/'/g, "''")}' -Force`;
  execFileSync("powershell.exe", ["-NoProfile", "-Command", cmd], { stdio: "inherit", cwd: root });
  // Compress-Archive usa `\`: lo normalizamos a `/` para que extraiga bien en Linux.
  normalizeZipSlashes(outZip);
} else {
  execFileSync("zip", ["-r", outZip, "."], { stdio: "inherit", cwd: distDir });
}

const mb = (fs.statSync(outZip).size / (1024 * 1024)).toFixed(2);
console.log(`[zip-dist] Creado: ${outZip} (${mb} MB)`);
console.log("[zip-dist] En Hostinger: subí el ZIP → extraer en public_html (raíz del sitio).");
