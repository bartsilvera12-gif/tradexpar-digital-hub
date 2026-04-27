/**
 * Genera materiales solo de la sección "Sobre Tradexpar":
 * - PNG captura página completa
 * - PDF con la captura (toda la página escalada a un tamaño de hoja seguro)
 * - TXT con todo el texto de la página (para buscar / copiar)
 *
 * Requiere preview: npm run build && npm run preview -- --host 127.0.0.1 --port 4173
 * Uso: node scripts/capture-sobre-tradexpar.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { setTimeout as delay } from "timers/promises";
import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "docs", "sobre-tradexpar");
const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4173";

/** Texto íntegro alineado a `AboutTradexparPage.tsx` (fuente de verdad del copy). */
const CONTENIDO_COMPLETO = `SOBRE TRADEXPAR
Ruta en el sitio: /sobre-tradexpar

===================================================================
HERO
===================================================================

Título:
  Sobre Tradexpar

Subtítulo:
  Distribuidora digital con visión contemporánea: orden, ejecución y flexibilidad
  para acercar productos de calidad a quienes los buscan.

===================================================================
IDENTIDAD — Nuestra identidad
===================================================================

Tradexpar es una distribuidora digital que trabaja con un modelo de comercialización
claro, actual y sostenible.

Conectamos productos con el mercado mediante procesos ágiles, comunicación transparente
y herramientas pensadas para el comercio de hoy.

No solo movemos stock: damos estructura a la forma en que los productos llegan a las personas.

===================================================================
METODOLOGÍA — Enfoque
===================================================================

Introducción:
  Tres pilares que guían cada decisión operativa y cada experiencia en la tienda.

01 — Estructura
  Procesos definidos que aseguran orden, trazabilidad y consistencia en cada paso.

02 — Ejecución
  Capacidad real para llevar productos al mercado con rapidez y estándares claros.

03 — Adaptación
  Canales digitales integrados a la dinámica comercial, sin fricción para el cliente.

===================================================================
OPERACIÓN — Operación
===================================================================

Párrafo introductorio:
  Integramos gestión, canales digitales y seguimiento en un mismo sistema de trabajo:

Lista:
  • Gestión y curaduría de productos
  • Comercialización en entornos digitales
  • Coordinación operativa entre actores
  • Seguimiento y mejora continua

Cierre:
  Cada etapa apunta al mismo objetivo: eficiencia y confianza en la venta.

===================================================================
MERCADO — Contexto
===================================================================

Párrafo:
  Entendemos el entorno local: hoy el mercado exige experiencias simples, mensajes claros
  y confianza en cada clic.

Lista:
  • Simplicidad en la experiencia de compra
  • Claridad en precios, stock y entregas
  • Confianza en cada interacción con la marca

Cierre:
  Por eso diseñamos la tienda y los procesos desde esa realidad.

===================================================================
PLATAFORMA — Base operativa
===================================================================

Párrafo:
  Tradexpar articula dos dimensiones que se complementan:

Dimensión operativa
  Gestión, coordinación y control de procesos comerciales con criterios profesionales.

Dimensión digital
  Plataformas y canales que hacen accesible el catálogo y acompañan al cliente de punta a punta.

Párrafo final:
  Esa combinación permite operar con estabilidad y escalar sin perder claridad.

===================================================================
ECOSISTEMA — Relación con el mercado
===================================================================

Introducción:
  Trabajamos con distintos perfiles que comparten la necesidad de canales serios y
  productos bien presentados:

Lista:
  • Empresas que quieren posicionar productos con respaldo
  • Equipos y personas ligadas a la comercialización
  • Emprendedores que construyen su propio canal de ventas

Cierre:
  Nuestro rol es ordenar el entorno para que esas relaciones fluyan con menos fricción.

===================================================================
VALORES — Criterios de trabajo
===================================================================

Introducción:
  En Tradexpar sostenemos estándares explícitos:

Claridad
  Procesos y mensajes comprensibles para todos los actores.

Consistencia
  Misma calidad de servicio en el tiempo, pedido tras pedido.

Responsabilidad
  Compromiso con lo acordado en cada operación.

Evolución
  Mejora continua de sistemas, catálogo y experiencia.

===================================================================
EN SÍNTESIS — Qué es Tradexpar
===================================================================

Tradexpar es una distribuidora digital que organiza, gestiona y facilita la comercialización
de productos en Paraguay, con un modelo estructurado y alineado a los canales que el mercado
utiliza hoy.
`;

const PAGE_W = 595;
const MARGIN = 36;
const MAX_PAGE_H = 14400; // límite práctico para visores PDF

function wrapLines(text, font, fontSize, maxWidth) {
  const lines = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(/(\s+)/);
    let line = "";
    for (const w of words) {
      const test = line + w;
      if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
        line = test;
      } else {
        if (line.trim()) lines.push(line.trimEnd());
        line = w.trimStart() ? w : "";
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
    else lines.push("");
  }
  return lines;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const txtPath = path.join(OUT_DIR, "Sobre-Tradexpar-contenido-completo.txt");
  fs.writeFileSync(txtPath, CONTENIDO_COMPLETO, "utf8");

  const pngPath = path.join(OUT_DIR, "Sobre-Tradexpar-captura-completa.png");
  const pdfPath = path.join(OUT_DIR, "Sobre-Tradexpar.pdf");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.25,
    locale: "es-PY",
  });

  const url = `${BASE}/sobre-tradexpar`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 }).catch(() =>
    page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 })
  );
  await delay(3000);
  await page.screenshot({ path: pngPath, fullPage: true, type: "png" });
  await browser.close();

  const pngBytes = fs.readFileSync(pngPath);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const png = await pdfDoc.embedPng(pngBytes);

  const innerW = PAGE_W - 2 * MARGIN;
  const titleBlock = 52;
  const maxImgH = MAX_PAGE_H - 2 * MARGIN - titleBlock;
  let scale = Math.min(innerW / png.width, maxImgH / png.height);
  const imgW = png.width * scale;
  const imgH = png.height * scale;
  const pageH = Math.min(MARGIN * 2 + titleBlock + imgH + 8, MAX_PAGE_H);

  const pdfPage = pdfDoc.addPage([PAGE_W, pageH]);
  pdfPage.drawText("Sobre Tradexpar — vista completa del sitio", {
    x: MARGIN,
    y: pageH - MARGIN - 14,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.14, 0.2),
  });
  pdfPage.drawText(url, {
    x: MARGIN,
    y: pageH - MARGIN - 28,
    size: 8,
    font,
    color: rgb(0.4, 0.44, 0.48),
  });
  pdfPage.drawImage(png, {
    x: MARGIN + (innerW - imgW) / 2,
    y: pageH - MARGIN - titleBlock - imgH,
    width: imgW,
    height: imgH,
  });

  // Páginas siguientes: texto completo (buscable / imprimible)
  const textFontSize = 9;
  const lineH = 11;
  const textMaxW = PAGE_W - 2 * MARGIN;
  const lines = wrapLines(CONTENIDO_COMPLETO, font, textFontSize, textMaxW);
  const A4_H = 842;
  const linesPerPage = Math.floor((A4_H - 2 * MARGIN - 36) / lineH) || 48;
  let i = 0;
  while (i < lines.length) {
    const chunk = lines.slice(i, i + linesPerPage);
    i += linesPerPage;
    const tp = pdfDoc.addPage([PAGE_W, A4_H]);
    tp.drawText("Sobre Tradexpar — contenido textual (completo)", {
      x: MARGIN,
      y: A4_H - MARGIN - 12,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.14, 0.2),
    });
    let y = A4_H - MARGIN - 28;
    for (const line of chunk) {
      tp.drawText(line.length > 0 ? line : " ", {
        x: MARGIN,
        y,
        size: textFontSize,
        font,
        color: rgb(0.15, 0.17, 0.2),
        maxWidth: textMaxW,
      });
      y -= lineH;
    }
  }

  fs.writeFileSync(pdfPath, await pdfDoc.save());
  console.log("Listo:");
  console.log(" ", pngPath);
  console.log(" ", pdfPath);
  console.log(" ", txtPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
