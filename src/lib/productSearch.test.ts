import { describe, it, expect } from "vitest";
import {
  searchProducts,
  productMatchesQuery,
  sortByRelevance,
  normalizeSearchText,
  MIN_PARTIAL_LEN,
} from "./productSearch";
import type { Product } from "@/types";

/** Fixture mínima de Product (solo los campos que usa el buscador). */
function makeProduct(p: Partial<Product> & { id: string; name: string }): Product {
  return {
    price: 100000,
    stock: 5,
    image: "",
    sku: "",
    description: "",
    category: "",
    ...p,
  } as Product;
}

const conservadora = makeProduct({
  id: "1",
  name: "Conservadora Coleman 50L",
  category: "Conservadoras",
  brand: "Coleman",
  sku: "CONS-50",
  description: "conservadora térmica portátil para playa",
});
const conservadorasPack = makeProduct({
  id: "2",
  name: "Set de Conservadoras Playeras x2",
  category: "Conservadoras",
  brand: "Genérica",
  sku: "CONS-PK2",
  description: "pack de dos conservadoras chicas",
});
const hieleraDescOnly = makeProduct({
  id: "3",
  name: "Hielera XL Camping",
  category: "Camping",
  brand: "Outdoor",
  sku: "HIE-XL",
  description: "funciona igual que una conservadora grande",
});
const earphoneFtx = makeProduct({
  id: "4",
  name: "AURI EARPHONE FTX E68 BT/MIC",
  category: "Audio",
  brand: "FTX",
  sku: "E68",
  description: "auriculares inalámbricos con micrófono",
});
const auricularKlip = makeProduct({
  id: "5",
  name: "Auricular Klip Xtreme KWH-001",
  category: "Audio",
  brand: "Klip Xtreme",
  sku: "KWH-001",
  description: "diadema gamer",
});
const audifonoAccent = makeProduct({
  id: "6",
  name: "Audífono Bluetooth Deportivo",
  category: "Audio",
  brand: "Sony",
  sku: "SP-01",
  description: "resistente al sudor",
});
const tecladoGamer = makeProduct({
  id: "7",
  name: "Teclado Gamer RGB",
  category: "Periféricos",
  brand: "Redragon",
  sku: "TG-99",
  description: "switches mecánicos",
});

const catalog: Product[] = [
  conservadora,
  conservadorasPack,
  hieleraDescOnly,
  earphoneFtx,
  auricularKlip,
  audifonoAccent,
  tecladoGamer,
];

const ids = (list: Product[]) => list.map((p) => p.id);

describe("normalizeSearchText", () => {
  it("baja a minúsculas y quita acentos (incluida la ñ → n, para buscar sin tilde)", () => {
    expect(normalizeSearchText("  AUDÍFONO  Ñoño ")).toBe("audifono nono");
  });
});

describe("búsqueda parcial (prefijo de palabra)", () => {
  it('"conserv" encuentra conservadora y conservadoras', () => {
    const res = searchProducts(catalog, "conserv");
    expect(ids(res)).toEqual(expect.arrayContaining(["1", "2"]));
    // También la hielera cuyo texto/sinónimo incluye "conservadora".
    expect(res.length).toBeGreaterThanOrEqual(2);
    expect(ids(res)).not.toContain("7"); // teclado, irrelevante
  });

  it('"conservadora" (singular) matchea el plural del catálogo', () => {
    const res = searchProducts(catalog, "conservadora");
    expect(ids(res)).toEqual(expect.arrayContaining(["1", "2"]));
  });

  it('"conservadoras" (plural) matchea el singular del catálogo', () => {
    const res = searchProducts(catalog, "conservadoras");
    expect(ids(res)).toEqual(expect.arrayContaining(["1", "2"]));
  });
});

describe("acentos", () => {
  it('"audifono" (sin acento) encuentra "Audífono"', () => {
    const res = searchProducts(catalog, "audifono");
    expect(ids(res)).toContain("6");
  });
  it('"audífono" (con acento) también', () => {
    const res = searchProducts(catalog, "audífono");
    expect(ids(res)).toContain("6");
  });
});

describe("singular / plural", () => {
  it('"auriculares" encuentra "Auricular ..."', () => {
    const res = searchProducts(catalog, "auriculares");
    expect(ids(res)).toContain("5");
  });
  it('"auricular" encuentra los de audio (incluye sinónimo earphone)', () => {
    const res = searchProducts(catalog, "auricular");
    expect(ids(res)).toEqual(expect.arrayContaining(["4", "5"]));
  });
});

describe("sinónimos ES/EN", () => {
  it('"audifonos" encuentra el EARPHONE por grupo de sinónimos', () => {
    const res = searchProducts(catalog, "audifonos");
    expect(ids(res)).toContain("4");
  });
});

describe("errores de tipeo (fuzzy)", () => {
  it('"conservdora" (falta una letra) encuentra conservadora', () => {
    const res = searchProducts(catalog, "conservdora");
    expect(ids(res)).toEqual(expect.arrayContaining(["1", "2"]));
  });
  it('"conservadroa" (letras intercambiadas) encuentra conservadora', () => {
    const res = searchProducts(catalog, "conservadroa");
    expect(ids(res)).toEqual(expect.arrayContaining(["1", "2"]));
  });
  it('"tecaldo" (transposición) encuentra "Teclado"', () => {
    const res = searchProducts(catalog, "tecaldo");
    expect(ids(res)).toContain("7");
  });
});

describe("búsquedas de varias palabras (AND)", () => {
  it('"auriculares klip" solo trae el Klip, no el FTX', () => {
    const res = searchProducts(catalog, "auriculares klip");
    expect(ids(res)).toContain("5");
    expect(ids(res)).not.toContain("4");
  });
  it('"conservadora coleman" acota al Coleman', () => {
    const res = searchProducts(catalog, "conservadora coleman");
    expect(ids(res)).toContain("1");
    expect(ids(res)).not.toContain("2");
  });
});

describe("mínimo de 3 caracteres para parcial", () => {
  it("un término de 2 letras no dispara match parcial masivo", () => {
    expect(MIN_PARTIAL_LEN).toBe(3);
    const res = searchProducts(catalog, "co");
    // "co" no es palabra completa de ningún producto → no debe traer conservadora por substring.
    expect(ids(res)).not.toContain("1");
    expect(ids(res)).not.toContain("2");
  });
});

describe("orden por relevancia", () => {
  it("nombre que empieza con el término va antes que match solo en descripción", () => {
    const res = searchProducts(catalog, "conservadora");
    const posName = ids(res).indexOf("1"); // "Conservadora Coleman ..." (empieza con)
    const posDesc = ids(res).indexOf("3"); // hielera: "conservadora" solo en descripción
    expect(posName).toBeGreaterThanOrEqual(0);
    expect(posDesc).toBeGreaterThanOrEqual(0);
    expect(posName).toBeLessThan(posDesc);
  });

  it("coincidencia exacta de nombre pesa más que parcial", () => {
    const exact = makeProduct({ id: "10", name: "Mouse", category: "Periféricos", description: "" });
    const partial = makeProduct({ id: "11", name: "Mousepad Gamer XL", category: "Periféricos", description: "" });
    const ordered = sortByRelevance([partial, exact], "mouse");
    expect(ids(ordered)[0]).toBe("10");
  });
});

describe("catálogo real: abreviatura CONSERV y anti-contaminación de sinónimos", () => {
  // Nombres tal como vienen del catálogo Fastrax (abrevian "CONSERV") + productos
  // con "cooler"/"fan" que NO deben aparecer al buscar conservadora.
  const realCatalog: Product[] = [
    makeProduct({ id: "v1", name: "VENTILADOR DE PIE 16 PULGADAS", category: "ELECTRODOMESTICO" }),
    makeProduct({ id: "g1", name: "GAB GAMER FTX-702BK VIDRIO TEMP 3 FAN MATX NEGRO", category: "COMPONENTE PC" }),
    makeProduct({ id: "g2", name: "GAB GAMER FTX PCC-G9BK 3 FAN ATX NEGRO", category: "COMPONENTE PC", description: "incluye cooler rgb" }),
    makeProduct({ id: "cpu", name: "CPU INTEL CORE I3-10100F C/COOL BX8070110100F", category: "COMPONENTE PC" }),
    makeProduct({ id: "c1", name: "CONSERV IGLOO 118L PARTY BAR C/RUEDAS EXT GRIS 34413", category: "TERMICOS" }),
    makeProduct({ id: "c2", name: "CONSERV BOLSA IGLOO 6LAT ESS GRIS 6P 66194", category: "TERMICOS" }),
    makeProduct({ id: "c3", name: "CONSERV BOLSA IGLOO 9LAT RETRO SQUARE LUNCH 63085", category: "TERMICOS" }),
  ];

  it('"conservadora" encuentra las CONSERV y NO trae ventiladores/gabinetes', () => {
    const res = searchProducts(realCatalog, "conservadora");
    expect(ids(res)).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));
    expect(ids(res)).not.toContain("v1");
    expect(ids(res)).not.toContain("g1");
    expect(ids(res)).not.toContain("g2"); // tiene "cooler" en la descripción, pero no es conservadora
    expect(ids(res)).not.toContain("cpu");
  });

  it('"conserv" (abreviatura) trae solo las CONSERV', () => {
    const res = searchProducts(realCatalog, "conserv");
    expect(ids(res)).toEqual(["c1", "c2", "c3"]);
  });

  it("un ventilador con 'cooler' heredado no queda etiquetado como conservadora", () => {
    // Regresión: la pertenencia a un grupo se decide solo con el texto propio.
    expect(productMatchesQuery(realCatalog[0], "conservadora")).toBe(false);
  });
});

describe("consultas vacías", () => {
  it("searchProducts vacío devuelve []", () => {
    expect(searchProducts(catalog, "")).toEqual([]);
    expect(searchProducts(catalog, "   ")).toEqual([]);
  });
  it("productMatchesQuery sin término devuelve true (catálogo completo)", () => {
    expect(productMatchesQuery(conservadora, "")).toBe(true);
  });
});
