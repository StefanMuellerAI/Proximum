/**
 * CRREM-Pfade-Extraktion (Build-Skript, einmalig / bei CRREM-Update ausfuehren).
 *
 * Liest die CRREM-Library-Dateien (Global Pathways v2.05 + Emission Factors
 * v2.05) und schreibt nur die fuer Deutschland relevanten Pfade nach
 * lib/data/crrem-de.json:
 *   - co2:    kg CO2e / m2 / Jahr je CRREM-Nutzungsart (Code DE.<TYPE>.CO2,
 *             Blatt "CO2 Pathways (sqm)")
 *   - energy: kWh / m2 / Jahr je CRREM-Nutzungsart (Code DE.<TYPE>.EUI,
 *             Blatt "EUI Pathways kWh (sqm)")
 *   - gridEf: kg CO2e / kWh Strom (DE-Zeile, Blatt "Emission Factors" der
 *             Emission-Factors-Datei)
 *
 * Neues Layout ab v2.05 (CRREM Library): Zeilen = Land x Nutzungsart mit
 * Code-Spalte, Spalten = Jahre (2020-2050).
 *
 * Aufruf: npm run crrem:extract
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PATHWAYS_XLSX = join(ROOT, "CRREM-Global-Pathways-V2.05.xlsx");
const EMISSION_XLSX = join(ROOT, "emission-factors-v2.05.xlsx");
const OUT_PATH = join(ROOT, "lib", "data", "crrem-de.json");

const YEAR_MIN = 2020;
const YEAR_MAX = 2050;

type Cell = { col: number; value: string; isString: boolean };
type Row = { r: number; cells: Cell[] };

function colToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml: string, shared: string[]): Row[] {
  const rows: Row[] = [];
  for (const rm of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const r = Number(rm[1]);
    const body = rm[2];
    const cells: Cell[] = [];
    for (const cm of body.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const attrs = cm[1] ?? cm[3] ?? "";
      const inner = cm[2] ?? "";
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      if (!refMatch) continue;
      const col = colToIndex(refMatch[1]);
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      const isMatch = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      let value = "";
      let isString = false;
      if (type === "s" && vMatch) {
        value = shared[Number(vMatch[1])] ?? "";
        isString = true;
      } else if (type === "inlineStr" && isMatch) {
        value = isMatch[1];
        isString = true;
      } else if (vMatch) {
        value = vMatch[1];
        isString = type === "str";
      }
      cells.push({ col, value, isString });
    }
    rows.push({ r, cells });
  }
  return rows;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) =>
      decodeXmlEntities(t[1]),
    );
    out.push(texts.join(""));
  }
  return out;
}

interface Workbook {
  files: Record<string, Uint8Array>;
  shared: string[];
  nameToFile: Record<string, string>;
}

function openWorkbook(path: string): Workbook {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const shared = parseSharedStrings(
    files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "",
  );
  const wb = strFromU8(files["xl/workbook.xml"]);
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g,
  )) {
    relMap.set(m[1], m[2]);
  }
  const nameToFile: Record<string, string> = {};
  for (const m of wb.matchAll(
    /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g,
  )) {
    const name = decodeXmlEntities(m[1]);
    const target = relMap.get(m[2]);
    if (target) nameToFile[name] = "xl/" + target.replace(/^\/?xl\//, "");
  }
  return { files, shared, nameToFile };
}

function sheetRows(wb: Workbook, needle: string): Row[] {
  const name = Object.keys(wb.nameToFile).find((n) => n.includes(needle));
  if (!name) throw new Error(`Sheet matching "${needle}" not found`);
  return parseSheet(strFromU8(wb.files[wb.nameToFile[name]]), wb.shared);
}

function isYear(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= YEAR_MIN && n <= YEAR_MAX ? n : null;
}

/** Header-Zeile mit Jahresspalten (2020..2050) finden -> Jahr -> Spalte. */
function yearColumns(rows: Row[]): Map<number, number> {
  for (const row of rows.slice(0, 10)) {
    const map = new Map<number, number>();
    for (const c of row.cells) {
      const y = isYear(c.value);
      if (y !== null) map.set(y, c.col);
    }
    if (map.size >= 10) return map;
  }
  throw new Error("Header row with year columns not found");
}

/**
 * v2.05-Layout: je Zeile ein Land x Nutzungsart mit Code-Zelle
 * (DE.<TYPE>.<suffix>); Werte in den Jahresspalten.
 */
function extractByCode(
  rows: Row[],
  suffix: "CO2" | "EUI",
): Record<string, Record<number, number>> {
  const years = yearColumns(rows);
  const codeRe = new RegExp(`^DE\\.([A-Za-z]+)\\.${suffix}$`);
  const result: Record<string, Record<number, number>> = {};

  for (const row of rows) {
    const codeCell = row.cells.find((c) => c.isString && codeRe.test(c.value));
    if (!codeCell) continue;
    const type = codeCell.value.match(codeRe)![1].toUpperCase();
    result[type] = {};
    for (const [year, col] of years) {
      const cell = row.cells.find((c) => c.col === col);
      if (cell && cell.value !== "") {
        const num = Number(cell.value);
        if (Number.isFinite(num)) result[type][year] = Number(num.toFixed(4));
      }
    }
  }
  if (Object.keys(result).length === 0)
    throw new Error(`No DE rows for ${suffix} found`);
  return result;
}

/** Netz-Emissionsfaktoren Strom: DE-Zeile im Emission-Factors-Blatt. */
function extractGridEf(rows: Row[]): Record<number, number> {
  const years = yearColumns(rows);
  const deRow = rows.find(
    (row) =>
      row.cells.some(
        (c) => c.isString && c.value.trim() === "DE" && c.col <= 3,
      ) && row.cells.some((c) => c.isString && /Germany/i.test(c.value)),
  );
  if (!deRow) throw new Error("DE row in Emission Factors sheet not found");

  const out: Record<number, number> = {};
  for (const [year, col] of years) {
    const cell = deRow.cells.find((c) => c.col === col);
    if (cell && cell.value !== "") {
      const num = Number(cell.value);
      if (Number.isFinite(num)) out[year] = Number(num.toFixed(5));
    }
  }
  return out;
}

function main() {
  const pathways = openWorkbook(PATHWAYS_XLSX);
  const emissions = openWorkbook(EMISSION_XLSX);

  const co2 = extractByCode(sheetRows(pathways, "CO2 Pathways (sqm)"), "CO2");
  const energy = extractByCode(
    sheetRows(pathways, "EUI Pathways kWh (sqm)"),
    "EUI",
  );
  const gridEf = extractGridEf(sheetRows(emissions, "Emission Factors"));

  const output = {
    meta: {
      source:
        "CRREM Library: Global Pathways v2.05 + Emission Factors v2.05 (crrem.org)",
      scenario: "1.5C",
      country: "DE",
      units: {
        co2: "kg CO2e / m2 / a",
        energy: "kWh / m2 / a",
        gridEf: "kg CO2e / kWh (Strom)",
      },
      generatedAt: new Date().toISOString(),
      note: "Automatisch erzeugt via scripts/crrem-extract.ts. Nicht manuell editieren.",
    },
    co2,
    energy,
    gridEf,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

  const types = Object.keys(co2);
  console.log(`OK -> ${OUT_PATH}`);
  console.log(`  Nutzungsarten (${types.length}): ${types.join(", ")}`);
  console.log(
    `  CO2 DE.OFF 2030 = ${co2["OFF"]?.[2030]} kg/m2a | Energy DE.OFF 2030 = ${energy["OFF"]?.[2030]} kWh/m2a`,
  );
  console.log(`  Grid EF DE 2030 = ${gridEf[2030]} kg/kWh`);
}

main();
