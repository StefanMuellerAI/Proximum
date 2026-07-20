/**
 * Minimaler XLSX-Writer (Excel-Exporte, GAP-11/GAP-13): erzeugt eine
 * OOXML-Arbeitsmappe mit mehreren Blaettern aus Zellen-Matrizen
 * (inline strings, Zahlen nativ). Kein externes Paket noetig.
 */
import { zipSync, strToU8 } from "fflate";

export type ExportCell = string | number | null | undefined;

export interface ExportSheet {
  name: string;
  rows: ExportCell[][];
}

function colLetter(i: number): string {
  let s = "";
  i++;
  while (i > 0) {
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sheetXml(rows: ExportCell[][]): string {
  const rowsXml = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          if (v == null || v === "") return "";
          const ref = `${colLetter(c)}${r + 1}`;
          if (typeof v === "number" && Number.isFinite(v))
            return `<c r="${ref}"><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(v))}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
}

/** Baut eine XLSX-Datei aus benannten Blaettern. */
export function writeXlsx(sheets: ExportSheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};

  const sheetEntries = sheets.map((s, i) => ({
    name: s.name.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"),
    file: `worksheets/sheet${i + 1}.xml`,
    rid: `rId${i + 1}`,
  }));

  files["[Content_Types].xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetEntries
      .map(
        (s) =>
          `<Override PartName="/xl/${s.file}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("")}</Types>`,
  );
  files["_rels/.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  files["xl/workbook.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries
      .map(
        (s, i) =>
          `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="${s.rid}"/>`,
      )
      .join("")}</sheets></workbook>`,
  );
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetEntries
      .map(
        (s) =>
          `<Relationship Id="${s.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${s.file}"/>`,
      )
      .join("")}</Relationships>`,
  );
  sheets.forEach((s, i) => {
    files[`xl/${sheetEntries[i].file}`] = strToU8(sheetXml(s.rows));
  });

  return zipSync(files);
}
