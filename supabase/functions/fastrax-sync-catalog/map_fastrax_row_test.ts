/**
 * Prueba real de parseo/mapeo según documentación Fastrax (sin llamar API ni DB).
 * Ejecutar: deno test --allow-env supabase/functions/fastrax-sync-catalog/map_fastrax_row_test.ts
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractProductRows,
  pickActive,
  pickCategory,
  pickDescription,
  pickFastraxCrc,
  pickImageUrl,
  pickName,
  pickPrice,
  pickSku,
  pickStock,
} from "./map_fastrax_row.ts";

Deno.test("ope=1 lista en { d: [...] } con sku, sal, crc, sta", () => {
  const parsed = {
    d: [
      { sku: "FX-REAL-001", sal: 5, crc: "crc-fx-001", sta: "A", atv: 1 },
    ],
  };
  const rows = extractProductRows(parsed);
  assertEquals(rows.length, 1);
  const r = rows[0];
  assertEquals(pickSku(r), "FX-REAL-001");
  assertEquals(pickStock(r), 5);
  assertEquals(pickFastraxCrc(r), "crc-fx-001");
  assertEquals(pickActive(r), true);
});

Deno.test("merge ope=1 + ope=2: nom, pre, prm, pmp, des, cat, mar", () => {
  const base = { sku: "FX-REAL-002", sal: 10, crc: "abc", sta: "A", atv: 1 };
  const detail = {
    nom: "Producto integración",
    pre: 100_000,
    prm: 85_000,
    pmp: true,
    des: "Descripción larga",
    bre: "Corta",
    cat: "Herramientas",
    mar: "Acme",
    img: "https://example.com/p.jpg",
  };
  const merged = { ...base, ...detail };
  assertEquals(pickName(merged), "Producto integración");
  assertEquals(pickDescription(merged).startsWith("Descripción larga"), true);
  assertEquals(pickPrice(merged), 85_000);
  assertEquals(pickStock(merged), 10);
  assertEquals(pickCategory(merged), "Herramientas — Acme");
  assertEquals(pickImageUrl(merged), "https://example.com/p.jpg");
  assertEquals(pickFastraxCrc(merged), "abc");
});

Deno.test("sin promo: usa pre", () => {
  const row = { sku: "X", sal: 1, nom: "N", pre: 50_000, prm: 40_000, atv: 1 };
  assertEquals(pickPrice(row), 50_000);
});

Deno.test("precopromo explícito con flag pro", () => {
  const row = {
    sku: "X",
    sal: 1,
    nom: "N",
    pre: 100,
    precopromo: 77,
    pro: true,
    atv: 1,
  };
  assertEquals(pickPrice(row), 77);
});

Deno.test("sta=B inactivo", () => {
  assertEquals(pickActive({ sku: "z", sta: "B" }), false);
});

Deno.test("blo=1 inactivo", () => {
  assertEquals(pickActive({ sku: "z", sta: "A", blo: 1 }), false);
});

Deno.test("ope=98 promo + precopromo", () => {
  const row = { sku: "x", pre: 1000, precopromo: 800, promo: 1, sal: 2, atv: 1 };
  assertEquals(pickPrice(row), 800);
});

Deno.test("respuesta anidada productos[]", () => {
  const parsed = { productos: [{ sku: "P99", sal: 0, nom: "Único", pre: 1, atv: 1 }] };
  const rows = extractProductRows(parsed);
  assertExists(rows[0]);
  assertEquals(pickSku(rows[0]), "P99");
});
