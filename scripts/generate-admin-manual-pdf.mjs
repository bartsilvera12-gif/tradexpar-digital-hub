/**
 * Genera docs/Manual-Panel-Admin-Tradexpar.pdf desde docs/manual-panel-admin-tradexpar.html
 * usando Chromium (Playwright). Requiere: npm install (playwright viene con @playwright/test).
 *
 * Uso: node scripts/generate-admin-manual-pdf.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "docs", "manual-panel-admin-tradexpar.html");
const PDF = path.join(ROOT, "docs", "Manual-Panel-Admin-Tradexpar.pdf");

async function main() {
  if (!fs.existsSync(HTML)) {
    console.error("No se encontró:", HTML);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(HTML).href, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.addStyleTag({
    content: `.no-print { display: none !important; }`,
  });

  await page.pdf({
    path: PDF,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `
      <div style="width:100%;font-size:9px;color:#64748b;text-align:center;font-family:Montserrat,Segoe UI,sans-serif;padding:0 12mm;">
        <span style="color:hsl(195 89% 47%);font-weight:600;">Tradexpar</span>
        · Manual panel admin · <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>
    `,
  });

  await browser.close();
  console.log("PDF generado:", PDF);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
