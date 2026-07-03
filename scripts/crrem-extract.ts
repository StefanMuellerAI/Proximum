/**
 * CRREM-Pfade-Extraktion (Build-Skript, einmalig / bei CRREM-Update ausfuehren).
 *
 * Liest CRREM-Global-Pathways-V2.04.xlsx und schreibt nur die fuer Deutschland
 * relevanten Pfade nach lib/data/crrem-de.json:
 *   - co2:    kg CO2e / m2 / Jahr je CRREM-Nutzungsart (DE.<TYPE>.CO2-Int, Blatt "2 - 1.5C CO2")
 *   - energy: kWh / m2 / Jahr je CRREM-Nutzungsart      (DE.<TYPE>.kWh-Int, Blatt "3 - 1.5 kWh")
 *   - gridEf: kg CO2 / kWh Strom (DE-Spalte, Blatt "8 - Grid EF Europe")
 *
 * Aufruf: npm run crrem:extract
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const XLSX_PATH = join(ROOT, "CRREM-Global-Pathways-V2.04.xlsx");
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
  const rowRe = /<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const r = Number(rm[1]);
    const body = rm[2];
    const cells: Cell[] = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(body))) {
      const attrs = cm[1] ?? cm[3] ?? "";
      const inner = cm[2] ?? "";
      const refMatch = /\br="([A-Z]+)\d+"/.exec(attrs);
      if (!refMatch) continue;
      const col = colToIndex(refMatch[1]);
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
      const isMatch = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
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
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) =>
      decodeXmlEntities(t[1]),
    );
    out.push(texts.join(""));
  }
  return out;
}

function resolveSheetFiles(
  files: Record<string, Uint8Array>,
): Record<string, string> {
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
  return nameToFile;
}

function isYear(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= YEAR_MIN && n <= YEAR_MAX ? n : null;
}

function extractIntensity(
  rows: Row[],
  suffix: "CO2-Int" | "kWh-Int",
): Record<string, Record<number, number>> {
  // Header code row: the row that contains DE.<TYPE>.<suffix> codes.
  let headerRow: Row | undefined;
  for (const row of rows.slice(0, 6)) {
    if (row.cells.some((c) => c.isString && c.value.includes("." + suffix))) {
      headerRow = row;
      break;
    }
  }
  if (!headerRow) throw new Error(`Header row for ${suffix} not found`);

  const colToType = new Map<number, string>();
  const codeRe = new RegExp(`^DE\\.([A-Za-z]+)\\.${suffix}$`);
  for (const c of headerRow.cells) {
    const m = codeRe.exec(c.value);
    if (m) colToType.set(c.col, m[1].toUpperCase());
  }
  if (colToType.size === 0)
    throw new Error(`No DE columns for ${suffix} found`);

  const result: Record<string, Record<number, number>> = {};
  for (const type of colToType.values()) result[type] = {};

  for (const row of rows) {
    const aCell = row.cells.find((c) => c.col === 0);
    if (!aCell) continue;
    const year = isYear(aCell.value);
    if (year === null) continue;
    for (const [col, type] of colToType) {
      const cell = row.cells.find((c) => c.col === col);
      if (cell && cell.value !== "") {
        const num = Number(cell.value);
        if (Number.isFinite(num)) result[type][year] = Number(num.toFixed(4));
      }
    }
  }
  return result;
}

function extractGridEf(rows: Row[]): Record<number, number> {
  // Country-code row (contains "DE"), then year rows below.
  let deCol = -1;
  for (const row of rows.slice(0, 6)) {
    const de = row.cells.find((c) => c.isString && c.value.trim() === "DE");
    if (de) {
      deCol = de.col;
      break;
    }
  }
  if (deCol < 0) throw new Error("DE column in Grid EF sheet not found");

  const out: Record<number, number> = {};
  for (const row of rows) {
    const aCell = row.cells.find((c) => c.col === 0);
    if (!aCell) continue;
    const year = isYear(aCell.value);
    if (year === null) continue;
    const cell = row.cells.find((c) => c.col === deCol);
    if (cell && cell.value !== "") {
      const num = Number(cell.value);
      if (Number.isFinite(num)) out[year] = Number(num.toFixed(5));
    }
  }
  return out;
}

function main() {
  const buf = readFileSync(XLSX_PATH);
  const files = unzipSync(new Uint8Array(buf));
  const shared = parseSharedStrings(strFromU8(files["xl/sharedStrings.xml"]));
  const nameToFile = resolveSheetFiles(files);

  const findSheet = (needle: string): Row[] => {
    const name = Object.keys(nameToFile).find((n) => n.includes(needle));
    if (!name) throw new Error(`Sheet matching "${needle}" not found`);
    return parseSheet(strFromU8(files[nameToFile[name]]), shared);
  };

  const co2 = extractIntensity(findSheet("1.5C CO2"), "CO2-Int");
  const energy = extractIntensity(findSheet("1.5 kWh"), "kWh-Int");
  const gridEf = extractGridEf(findSheet("Grid EF Europe"));

  const output = {
    meta: {
      source: "CRREM-Global-Pathways-V2.04.xlsx",
      scenario: "1.5C",
      country: "DE",
      units: {
        co2: "kg CO2e / m2 / a",
        energy: "kWh / m2 / a",
        gridEf: "kg CO2 / kWh (Strom)",
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
