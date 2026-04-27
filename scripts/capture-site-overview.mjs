/**
 * Genera capturas de pantalla de rutas públicas (y algunas admin) y las une en un PDF.
 * Requiere el sitio sirviendo en PREVIEW_URL (por defecto http://127.0.0.1:4173 tras `npm run build && npm run preview`).
 *
 * Uso: node scripts/capture-site-overview.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { setTimeout as delay } from "timers/promises";
import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "docs", "capturas-sitio");
const OUT_PDF = path.join(ROOT, "docs", "Tradexpar-vistas-sitio.pdf");

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4173";

/** @type {{ id: string; title: string; path: string; fullPage?: boolean }[]} */
const ROUTES = [
  { id: "01-inicio", title: "Inicio (home)", path: "/", fullPage: true },
  { id: "02-catalogo", title: "Catálogo / productos", path: "/products", fullPage: true },
  { id: "03-detalle-producto", title: "Ficha de producto", path: null, fullPage: true },
  { id: "04-carrito", title: "Carrito", path: "/cart", fullPage: true },
  { id: "05-checkout", title: "Checkout", path: "/checkout", fullPage: true },
  { id: "06-favoritos", title: "Favoritos (wishlist)", path: "/wishlist", fullPage: true },
  { id: "07-login-cliente", title: "Login cliente", path: "/login", fullPage: true },
  { id: "08-registro-cliente", title: "Registro cliente", path: "/register", fullPage: true },
  { id: "09-cuenta-cliente", title: "Mi cuenta", path: "/account", fullPage: true },
  { id: "10-afiliados", title: "Afiliados (landing)", path: "/afiliados", fullPage: true },
  { id: "11-afiliados-panel", title: "Panel afiliados", path: "/afiliados/panel", fullPage: true },
  { id: "12-sobre-tradexpar", title: "Sobre Tradexpar", path: "/sobre-tradexpar", fullPage: true },
  { id: "13-pago-exitoso", title: "Pago exitoso", path: "/success", fullPage: true },
  { id: "14-admin-login", title: "Admin — login", path: "/admin/login", fullPage: true },
  { id: "15-admin-dashboard", title: "Admin — dashboard", path: "/admin/dashboard", fullPage: true },
  { id: "16-404", title: "Página no encontrada", path: "/ruta-inexistente-prueba-404", fullPage: true },
];

const PAGE_W = 595;
const MARGIN = 40;
const TITLE_H = 22;
const MAX_PAGE_H = 3200;

function fitImageToPage(imgW, imgH, maxW, maxH) {
  let w = imgW;
  let h = imgH;
  const s = Math.min(maxW / w, maxH / h, 1);
  return { w: w * s, h: h * s };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.25,
    locale: "es-PY",
  });
  const page = await context.newPage();

  const captures = [];

  for (const route of ROUTES) {
    let urlPath = route.path;
    if (route.id === "03-detalle-producto") {
      try {
        await page.goto(`${BASE}/products`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await delay(2500);
        const href = await page.evaluate(() => {
          const links = [...document.querySelectorAll('a[href^="/products/"]')];
          const found = links
            .map((a) => a.getAttribute("href"))
            .find((h) => h && /^\/products\/[^/?#]+$/.test(h));
          return found || null;
        });
        if (!href) {
          console.warn("Saltando detalle producto: no hay enlaces al catálogo.");
          continue;
        }
        urlPath = href;
      } catch (e) {
        console.warn("Saltando detalle producto:", e.message);
        continue;
      }
    }

    const url = `${BASE}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`;
    const pngPath = path.join(OUT_DIR, `${route.id}.png`);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(2000);
      await page.screenshot({
        path: pngPath,
        fullPage: route.fullPage !== false,
        type: "png",
      });
      captures.push({ ...route, path: urlPath, pngPath, title: route.title });
      console.log("OK", route.id, url);
    } catch (e) {
      console.warn("Fallo", route.id, url, e.message);
    }
  }

  await browser.close();

  if (captures.length === 0) {
    console.error("No se capturó ninguna pantalla. ¿Está el preview en", BASE, "?");
    process.exit(1);
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const innerW = PAGE_W - 2 * MARGIN;

  for (const cap of captures) {
    const bytes = fs.readFileSync(cap.pngPath);
    const png = await pdfDoc.embedPng(bytes);
    const maxImgH = MAX_PAGE_H - MARGIN * 2 - TITLE_H - 8;
    const { w, h } = fitImageToPage(png.width, png.height, innerW, maxImgH);
    const pageH = Math.min(MARGIN * 2 + TITLE_H + 8 + h + 8, MAX_PAGE_H);
    const pdfPage = pdfDoc.addPage([PAGE_W, pageH]);

    pdfPage.drawText(cap.title, {
      x: MARGIN,
      y: pageH - MARGIN - 14,
      size: 11,
      font,
      color: rgb(0.12, 0.16, 0.22),
    });
    pdfPage.drawText(cap.path || cap.id, {
      x: MARGIN,
      y: pageH - MARGIN - 26,
      size: 8,
      font,
      color: rgb(0.45, 0.48, 0.52),
    });

    const imgY = pageH - MARGIN - TITLE_H - 8 - h;
    pdfPage.drawImage(png, {
      x: MARGIN + (innerW - w) / 2,
      y: imgY,
      width: w,
      height: h,
    });
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(OUT_PDF, pdfBytes);
  console.log("\nPDF:", OUT_PDF);
  console.log("PNG:", OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
