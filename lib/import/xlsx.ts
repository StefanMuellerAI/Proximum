/**
 * Minimaler XLSX-Reader (Laufzeit-tauglich, kein externes Parser-Paket):
 * unzippt die OOXML-Struktur (fflate) und liest Blaetter als Zellen-Matrix.
 * Gleiches Vorgehen wie scripts/crrem-extract.ts, aber Buffer-basiert und
 * als wiederverwendbares Modul fuer Import-Routen.
 */
import { unzipSync, strFromU8 } from "fflate";

export type CellValue = string | number | null;

export interface SheetData {
  name: string;
  /** Zeilen als dichte Arrays (Index = Spaltenindex, fehlend = null). */
  rows: CellValue[][];
}

function colToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
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

function parseSheetXml(xml: string, shared: string[]): CellValue[][] {
  const rows: CellValue[][] = [];
  for (const rm of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIdx = Number(rm[1]) - 1;
    const body = rm[2];
    const row: CellValue[] = [];
    for (const cm of body.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const attrs = cm[1] ?? cm[3] ?? "";
      const inner = cm[2] ?? "";
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      if (!refMatch) continue;
      const col = colToIndex(refMatch[1]);
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      const isMatch = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      let value: CellValue = null;
      if (type === "s" && vMatch) {
        value = shared[Number(vMatch[1])] ?? "";
      } else if (type === "inlineStr" && isMatch) {
        value = decodeXmlEntities(isMatch[1]);
      } else if (type === "str" && vMatch) {
        value = decodeXmlEntities(vMatch[1]);
      } else if (vMatch) {
        const num = Number(vMatch[1]);
        value = Number.isFinite(num) ? num : vMatch[1];
      }
      row[col] = value;
    }
    rows[rowIdx] = row;
  }
  // Luecken (leere Zeilen) als leere Arrays fuellen
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** Liest alle Blaetter einer XLSX-Datei aus einem Buffer. */
export function readXlsx(data: Uint8Array): SheetData[] {
  const files = unzipSync(data);
  const sharedXml = files["xl/sharedStrings.xml"];
  const shared = sharedXml ? parseSharedStrings(strFromU8(sharedXml)) : [];
  const wb = strFromU8(files["xl/workbook.xml"]);
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);

  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g,
  )) {
    relMap.set(m[1], m[2]);
  }

  const sheets: SheetData[] = [];
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const name = decodeXmlEntities(m[1]);
    const target = relMap.get(m[2]);
    if (!target) continue;
    const file = files["xl/" + target.replace(/^\/?xl\//, "")];
    if (!file) continue;
    sheets.push({ name, rows: parseSheetXml(strFromU8(file), shared) });
  }
  return sheets;
}
