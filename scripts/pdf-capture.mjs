/**
 * Visueller PDF-/Druck-Check: laedt die Demo-Analyse, erzeugt das Druck-PDF und
 * Screenshots im Druckmodus zum optischen Pruefen. Nutzt das installierte Chrome.
 * Aufruf (bei laufendem Dev-Server): node scripts/pdf-capture.mjs
 */
import { chromium } from "playwright-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "/tmp";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({
  viewport: { width: 1120, height: 1500 },
  deviceScaleFactor: 2,
});

console.log("laden…");
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.click("text=Beispiel-Ausweis");
await page.waitForURL("**/analyse");
await page.waitForSelector("text=CRREM-Dekarbonisierung", { timeout: 30000 });
console.log("dashboard geladen, warte auf Fassade/Risiko…");
await page
  .waitForSelector('img[alt="Fassade (Street View)"]', { timeout: 45000 })
  .then(() => console.log("Fassadenbild vorhanden"))
  .catch(() => console.log("kein Fassadenbild"));
await page.waitForTimeout(4000);

// Echtes Druck-PDF
await page.pdf({
  path: `${OUT}/report.pdf`,
  printBackground: true,
  preferCSSPageSize: true,
});
console.log("PDF: /tmp/report.pdf");

// Druckmodus-Screenshots (Gesamtseite) fuer die optische Analyse
await page.emulateMedia({ media: "print" });
await page.setViewportSize({ width: 794, height: 1123 });
await page.waitForTimeout(600);
const total = await page.evaluate(() => document.documentElement.scrollHeight);
console.log("Druck-Gesamthoehe:", total, "px (~", Math.ceil(total / 1123), "A4-Seiten)");

// In A4-hohe Kacheln zerlegen (durch Scrollen), damit Details lesbar bleiben
const pageH = 1123;
let idx = 0;
for (let y = 0; y < total; y += pageH, idx++) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(150);
  const n = String(idx).padStart(2, "0");
  await page.screenshot({ path: `${OUT}/pg_${n}.png` });
}
console.log(`Screenshots: /tmp/pg_00.png .. /tmp/pg_${String(idx - 1).padStart(2, "0")}.png`);

await browser.close();
console.log("fertig");
