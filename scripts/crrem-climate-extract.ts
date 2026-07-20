/**
 * CRREM-Klimadaten-Extraktion (Build-Skript, einmalig / bei CRREM-Update).
 *
 * Liest hdd-cdd-eu-v2.05.xlsx (Blatt "HDD CDD Zip Code Matching 2024") und
 * schreibt die deutschen HDD/CDD-Basiswerte (2024) und die jaehrlichen
 * Aenderungsraten unter RCP 4.5 nach lib/data/crrem-climate-de.json.
 *
 * Aggregation auf 3-stellige PLZ-Praefixe (~670 Regionen): ausreichend fuer
 * die Klimanormalisierung NF(x) auf Screening-Niveau, haelt die Datei klein.
 *
 * Aufruf: npm run crrem:climate
 * Erwartet die Datei unter ip_reference/predium_academy/referenzen/crrem/.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const XLSX = join(
  ROOT,
  "ip_reference/predium_academy/referenzen/crrem/hdd-cdd-eu-v2.05.xlsx",
);
const OUT = join(ROOT, "lib", "data", "crrem-climate-de.json");

function main() {
  const files = unzipSync(new Uint8Array(readFileSync(XLSX)));
  const sharedXml = strFromU8(files["xl/sharedStrings.xml"]);
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""),
  );
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const wb = strFromU8(files["xl/workbook.xml"]);
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g,
  ))
    relMap.set(m[1], m[2]);
  let sheetFile = "";
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    if (m[1].includes("2024"))
      sheetFile = "xl/" + relMap.get(m[2])!.replace(/^\/?xl\//, "");
  }
  if (!sheetFile) throw new Error("Sheet '... 2024' nicht gefunden");

  const xml = strFromU8(files[sheetFile]);

  // Spalten (Header-Zeile): 0=ZIP,1=Country,2=NUTS0,...,7=CDD_2024,
  // 8=CDD_45_pa,9=CDD_85_pa,10=HDD_2024,11=HDD_45_pa,12=HDD_85_pa
  const agg = new Map<
    string,
    { n: number; cdd: number; cddPa: number; hdd: number; hddPa: number }
  >();
  let deRows = 0;

  const colToIdx = (letters: string) => {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };

  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: (string | undefined)[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = cm[1].match(/r="([A-Z]+)\d+"/);
      if (!ref) continue;
      const idx = colToIdx(ref[1]);
      const t = cm[1].match(/t="([^"]+)"/)?.[1];
      const v = cm[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];
      cells[idx] = t === "s" && v != null ? shared[Number(v)] : v;
    }
    const zip = cells[0] ?? "";
    // Deutsche Zeilen: ZIP "DE#####" (CRREM-Kodierung Land + PLZ)
    if (!/^DE\d{4,5}$/.test(zip)) continue;
    const plz = zip.slice(2).padStart(5, "0");
    const cdd = Number(cells[7]);
    const cddPa = Number(cells[8]);
    const hdd = Number(cells[10]);
    const hddPa = Number(cells[11]);
    if (![cdd, cddPa, hdd, hddPa].every(Number.isFinite)) continue;
    deRows++;
    const prefix = plz.slice(0, 3);
    const e = agg.get(prefix) ?? { n: 0, cdd: 0, cddPa: 0, hdd: 0, hddPa: 0 };
    e.n++;
    e.cdd += cdd;
    e.cddPa += cddPa;
    e.hdd += hdd;
    e.hddPa += hddPa;
    agg.set(prefix, e);
  }
  if (deRows === 0) throw new Error("Keine DE-Zeilen gefunden");

  const byPrefix: Record<
    string,
    { hdd: number; hddPa: number; cdd: number; cddPa: number }
  > = {};
  let tHdd = 0;
  let tHddPa = 0;
  let tCdd = 0;
  let tCddPa = 0;
  let tN = 0;
  for (const [prefix, e] of [...agg.entries()].sort()) {
    byPrefix[prefix] = {
      hdd: Number((e.hdd / e.n).toFixed(1)),
      hddPa: Number((e.hddPa / e.n).toFixed(3)),
      cdd: Number((e.cdd / e.n).toFixed(1)),
      cddPa: Number((e.cddPa / e.n).toFixed(3)),
    };
    tHdd += e.hdd;
    tHddPa += e.hddPa;
    tCdd += e.cdd;
    tCddPa += e.cddPa;
    tN += e.n;
  }

  const output = {
    meta: {
      source: "CRREM hdd-cdd-eu-v2.05.xlsx, Blatt 'HDD CDD Zip Code Matching 2024'",
      scenario: "RCP 4.5 (pa-Aenderungsraten)",
      baseYear: 2024,
      aggregation: "Mittelwert je 3-stelligem PLZ-Praefix",
      generatedAt: new Date().toISOString(),
      note: "Automatisch erzeugt via scripts/crrem-climate-extract.ts. Nicht manuell editieren.",
    },
    deAverage: {
      hdd: Number((tHdd / tN).toFixed(1)),
      hddPa: Number((tHddPa / tN).toFixed(3)),
      cdd: Number((tCdd / tN).toFixed(1)),
      cddPa: Number((tCddPa / tN).toFixed(3)),
    },
    byPrefix,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(output, null, 1));
  console.log(
    `OK -> ${OUT} (${Object.keys(byPrefix).length} PLZ-Praefixe aus ${deRows} PLZ-Zeilen)`,
  );
  console.log("DE-Durchschnitt:", output.deAverage);
}

main();
