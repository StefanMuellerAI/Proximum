import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parsePrediumExcel } from "@/lib/import/predium-excel";

/** Baut eine minimale XLSX-Datei (ein Blatt, inline strings) fuer Tests. */
function makeXlsx(rows: (string | number | null)[][]): Uint8Array {
  const colLetter = (i: number) => {
    let s = "";
    i++;
    while (i > 0) {
      s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  };
  const rowsXml = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          if (v == null || v === "") return "";
          const ref = `${colLetter(c)}${r + 1}`;
          if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
          const esc = v
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return `<c r="${ref}" t="inlineStr"><is><t>${esc}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");

  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

  return zipSync({
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(rels),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

const HEADER = [
  "Name",
  "Adresse",
  "Gebäudetyp",
  "Ausweistyp",
  "Baujahr",
  "Energiebezugsfläche [m²]",
  "Endenergie Wärme [kWh/m²a]",
  "Endenergie Strom [kWh/m²a]",
  "Primärenergie [kWh/m²a]",
  "Effizienzklasse",
  "Energieträger Heizung",
];

describe("parsePrediumExcel", () => {
  it("importiert NWG-Zeile mit getrennten Wärme-/Stromwerten", () => {
    const xlsx = makeXlsx([
      ["Predium Export", null, null],
      HEADER,
      [
        "Bürohaus Mitte",
        "Beispielstr. 1, 60311 Frankfurt",
        "Nichtwohngebäude",
        "Bedarfsausweis",
        1985,
        2500,
        120,
        45,
        210,
        null,
        "Erdgas",
      ],
    ]);

    const result = parsePrediumExcel(xlsx);
    expect(result.errors).toHaveLength(0);
    expect(result.buildings).toHaveLength(1);

    const b = result.buildings[0];
    expect(b.name).toBe("Bürohaus Mitte");
    expect(b.normalized.gebaeudetyp).toBe("Nichtwohngebäude");
    expect(b.normalized.heatKwhM2a).toBe(120);
    expect(b.normalized.electricityKwhM2a).toBe(45);
    expect(b.normalized.bezugsflaecheM2).toBe(2500);
    expect(b.normalized.heatCarrier).toBe("erdgas");
    expect(b.normalized.baujahr).toBe(1985);
    expect(
      b.normalized.notes.some((n) => n.includes("Predium-Excel-Export")),
    ).toBe(true);
  });

  it("importiert WG-Zeile mit Einzelwert und Effizienzklasse", () => {
    const xlsx = makeXlsx([
      HEADER,
      [
        null,
        "Wohnweg 5, 50667 Köln",
        "Wohngebäude",
        "Verbrauchsausweis",
        1962,
        850,
        155,
        null,
        180,
        "E",
        "Heizöl",
      ],
    ]);

    const result = parsePrediumExcel(xlsx);
    expect(result.buildings).toHaveLength(1);
    const b = result.buildings[0];
    expect(b.name).toBe("Wohnweg 5, 50667 Köln");
    expect(b.normalized.gebaeudetyp).toBe("Wohngebäude");
    expect(b.normalized.ausweistyp).toBe("Verbrauchsausweis");
    expect(b.normalized.heatKwhM2a).toBe(155);
    expect(b.normalized.epcClass).toBe("E");
    expect(b.normalized.heatCarrier).toBe("heizoel");
  });

  it("überspringt Zeilen ohne Endenergie mit Fehlerhinweis", () => {
    const xlsx = makeXlsx([
      HEADER,
      ["Ohne Energie", "Teststr. 1", "Wohngebäude", null, 2000, 500, null, null, null, null, null],
      ["Mit Energie", "Teststr. 2", "Wohngebäude", null, 2000, 500, 90, null, null, null, "Gas"],
    ]);

    const result = parsePrediumExcel(xlsx);
    expect(result.buildings).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("keine Endenergie");
  });

  it("erkennt Header auch mit Einzelspalten für Straße/PLZ/Ort", () => {
    const xlsx = makeXlsx([
      [
        "Objektname",
        "Straße",
        "PLZ",
        "Ort",
        "Nutzung",
        "Endenergie gesamt [kWh/m²a]",
        "NGF [m²]",
      ],
      ["Halle Nord", "Industrieweg 9", "44145", "Dortmund", "Logistik", 95, 8000],
    ]);

    const result = parsePrediumExcel(xlsx);
    expect(result.buildings).toHaveLength(1);
    const b = result.buildings[0];
    expect(b.normalized.adresse).toBe("Industrieweg 9, 44145 Dortmund");
    expect(b.normalized.gebaeudetyp).toBe("Nichtwohngebäude");
    expect(b.normalized.crremType).toBe("DWW");
    // NWG ohne Waerme/Strom-Split: 70/30-Naeherung aus Gesamtwert
    expect(b.normalized.totalKwhM2a).toBeCloseTo(95, 5);
  });

  it("liefert verständlichen Fehler ohne erkennbare Header-Zeile", () => {
    const xlsx = makeXlsx([
      ["foo", "bar"],
      [1, 2],
    ]);
    const result = parsePrediumExcel(xlsx);
    expect(result.buildings).toHaveLength(0);
    expect(result.errors[0].message).toContain("Header");
  });
});
