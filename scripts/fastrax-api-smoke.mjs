/**
 * Prueba mínima contra la API Fastrax (ope=1) usando variables de entorno.
 * No imprime secretos. Cargá FASTRAX_* en el entorno o en `.env.local` en la raíz del repo.
 *
 * Uso: node scripts/fastrax-api-smoke.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnvFile(name) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function countProductishRows(parsed) {
  if (Array.isArray(parsed)) {
    const first = parsed[0];
    if (first && typeof first === "object" && !Array.isArray(first)) return parsed.length;
    let n = 0;
    for (const el of parsed) {
      if (el && typeof el === "object") n += countProductishRows(el);
    }
    return n;
  }
  if (parsed && typeof parsed === "object") {
    const keys = ["productos", "Productos", "datos", "data", "articulos", "Articulos", "result"];
    for (const k of keys) {
      if (k in parsed) return countProductishRows(parsed[k]);
    }
    let n = 0;
    for (const v of Object.values(parsed)) {
      if (Array.isArray(v) || (v && typeof v === "object")) n += countProductishRows(v);
    }
    return n;
  }
  return 0;
}

loadDotEnvFile(".env.local");
loadDotEnvFile(".env");

const url = (process.env.FASTRAX_API_URL ?? "").trim().replace(/\/$/, "");
const cod = (process.env.FASTRAX_COD ?? "").trim();
const pas = (process.env.FASTRAX_PAS ?? "").trim();
const fmt = (process.env.FASTRAX_REQUEST_FORMAT ?? "json").toLowerCase();

if (!url || !cod || !pas) {
  console.error(
    "Faltan FASTRAX_API_URL / FASTRAX_COD / FASTRAX_PAS (definilas en .env.local o exportá en la shell)."
  );
  process.exit(2);
}

const body =
  fmt === "form" || fmt === "urlencoded"
    ? new URLSearchParams({ ope: "1", cod, pas }).toString()
    : JSON.stringify({ ope: 1, cod, pas });

const res = await fetch(url, {
  method: "POST",
  headers:
    fmt === "form" || fmt === "urlencoded"
      ? { "Content-Type": "application/x-www-form-urlencoded" }
      : { "Content-Type": "application/json", Accept: "application/json" },
  body,
  signal: AbortSignal.timeout(90_000),
});

const text = await res.text();
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { _raw_len: text.length };
}

const approxRows = countProductishRows(parsed);
console.log(JSON.stringify({ http: res.status, approxRows, format: fmt }, null, 2));
process.exit(res.ok ? 0 : 1);
