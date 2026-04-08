/**
 * Genera INSERTs para tradexpar.paraguay_cities desde el extracto markdown de Wikipedia
 * (Anexo:Distritos de Paraguay). Ejecutar desde la raíz del repo:
 *   node scripts/generate-paraguay-cities-sql.mjs > supabase/tradexpar_paraguay_cities_seed.sql
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "data", "paraguay_municipios_wiki_extract.md");

/** Ciudades con código propio en el listado PagoPar usado por Tradexpar (15 entradas). */
const CITY_TO_PAGOPAR = {
  Asunción: "1",
  "Ciudad del Este": "2",
  "San Lorenzo": "3",
  Luque: "4",
  Capiatá: "5",
  Lambaré: "6",
  "Fernando de la Mora": "7",
  Limpio: "8",
  Ñemby: "9",
  Encarnación: "10",
  "Pedro Juan Caballero": "11",
  "Coronel Oviedo": "12",
  Villarrica: "13",
  Caaguazú: "14",
  Itauguá: "15",
};

/** Si el municipio no está en la lista PagoPar, usamos un hub regional por departamento. */
const DEPT_TO_PAGOPAR = {
  Asunción: "1",
  "Alto Paraná": "2",
  Amambay: "11",
  "Alto Paraguay": "11",
  Boquerón: "11",
  Caaguazú: "12",
  Caazapá: "12",
  Canindeyú: "2",
  Central: "1",
  Concepción: "11",
  Cordillera: "12",
  Guairá: "13",
  "Itapúa": "10",
  Misiones: "10",
  Paraguarí: "6",
  "Presidente Hayes": "1",
  "San Pedro": "12",
  "Ñeembucú": "10",
};

function pagoparCodeFor(name, department) {
  if (CITY_TO_PAGOPAR[name]) return CITY_TO_PAGOPAR[name];
  const d = DEPT_TO_PAGOPAR[department];
  if (d) return d;
  return "1";
}

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

const text = fs.readFileSync(src, "utf8");
const lines = text.split(/\r?\n/);
let department = null;
const rows = [];
const deptRe = /^\|\s*\[([^\]]+)\]\([^)]+\)\s+(\d+)\s+municipios?\s*\|/;
/** URLs de Wikipedia pueden incluir paréntesis, p. ej. ...wiki/Foo_(Paraguay) */
const cityRe =
  /^\|\s*\[([^\]]+)\]\((https:\/\/es\.wikipedia\.org\/wiki(?:[^()]|\([^()]*\))*)\)\s+\|/;

for (const line of lines) {
  const dm = line.match(deptRe);
  if (dm) {
    department = dm[1].trim();
    continue;
  }
  const cm = line.match(cityRe);
  if (cm && department) {
    const name = cm[1].trim().replace(/\s+/g, " ");
    if (!name || name === "Municipio") continue;
    rows.push({ name, department });
  }
}

const dedup = new Map();
for (const r of rows) {
  const key = `${r.department}\0${r.name}`;
  if (!dedup.has(key)) dedup.set(key, r);
}
const unique = [...dedup.values()].sort((a, b) => {
  const c = a.department.localeCompare(b.department, "es");
  if (c !== 0) return c;
  return a.name.localeCompare(b.name, "es");
});

let sort = 0;
const inserts = unique.map((r) => {
  sort += 1;
  const code = pagoparCodeFor(r.name, r.department);
  return `  (${sqlStr(r.name)}, ${sqlStr(r.department)}, ${sqlStr(code)}, ${sort})`;
});

const sql = [
  `-- Generado por scripts/generate-paraguay-cities-sql.mjs — ${unique.length} municipios`,
  `-- Fuente: Wikipedia (Anexo:Distritos de Paraguay). pagopar_city_code = hub PagoPar (1–15).`,
  "",
  "insert into tradexpar.paraguay_cities (name, department, pagopar_city_code, sort_order)",
  "values",
  inserts.join(",\n"),
  "on conflict (name, department) do update set",
  "  pagopar_city_code = excluded.pagopar_city_code,",
  "  sort_order = excluded.sort_order;",
  "",
].join("\n");

const outFile = path.join(root, "supabase", "tradexpar_paraguay_cities_seed.sql");
fs.writeFileSync(outFile, sql, "utf8");
console.error(`[generate-paraguay-cities-sql] ${unique.length} municipios → ${outFile}`);
