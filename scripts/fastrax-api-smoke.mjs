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
    const keys = ["productos", "Productos", "datos", "data", "articulos", "Articulos", "result", "d", "D"];
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
const fmtEnv = (process.env.FASTRAX_REQUEST_FORMAT ?? "").trim().toLowerCase();
const ope = (process.env.FASTRAX_SMOKE_OPE ?? "1").trim();

if (!url || !cod || !pas) {
  console.error(
    "Faltan FASTRAX_API_URL / FASTRAX_COD / FASTRAX_PAS (definilas en .env.local o exportá en la shell)."
  );
  process.exit(2);
}

async function postFastrax(format, opeNum) {
  const body =
    format === "form" || format === "urlencoded"
      ? new URLSearchParams({ ope: String(opeNum), cod, pas }).toString()
      : JSON.stringify({ ope: Number(opeNum), cod, pas });
  const res = await fetch(url, {
    method: "POST",
    headers:
      format === "form" || format === "urlencoded"
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
    parsed = { _non_json: true, _raw_len: text.length };
  }
  return { res, parsed, textLen: text.length };
}

const tryOrder =
  fmtEnv === "form" || fmtEnv === "urlencoded"
    ? ["form", "json"]
    : fmtEnv === "json"
      ? ["json", "form"]
      : ["json", "form"];

let last = { http: 0, approxRows: 0, format: "", textLen: 0 };
for (const format of tryOrder) {
  const { res, parsed, textLen } = await postFastrax(format, ope);
  const approxRows = countProductishRows(parsed);
  last = { http: res.status, approxRows, format, textLen };
  if (res.ok && approxRows > 0) break;
  if (res.ok) break;
}

console.log(
  JSON.stringify(
    {
      http: last.http,
      approxRows: last.approxRows,
      format_used: last.format,
      response_len: last.textLen,
      ope,
      tried: tryOrder,
    },
    null,
    2
  )
);
process.exit(last.http >= 200 && last.http < 300 ? 0 : 1);
