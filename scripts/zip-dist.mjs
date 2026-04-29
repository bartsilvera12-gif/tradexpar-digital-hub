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

if (process.platform === "win32") {
  const src = `${distDir}\\*`;
  const cmd = `Compress-Archive -Path '${src.replace(/'/g, "''")}' -DestinationPath '${outZip.replace(/'/g, "''")}' -Force`;
  execFileSync("powershell.exe", ["-NoProfile", "-Command", cmd], { stdio: "inherit", cwd: root });
} else {
  execFileSync("zip", ["-r", outZip, "."], { stdio: "inherit", cwd: distDir });
}

const mb = (fs.statSync(outZip).size / (1024 * 1024)).toFixed(2);
console.log(`[zip-dist] Creado: ${outZip} (${mb} MB)`);
console.log("[zip-dist] En Hostinger: subí el ZIP → extraer en public_html (raíz del sitio).");
