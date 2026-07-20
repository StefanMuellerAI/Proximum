/**
 * Bulk-Importer fuer Predium-Excel-Exporte (Abloeseplan 1.1).
 *
 * Die 100-500 Bestandsgebaeude kommen per Excel-Export aus Predium, nicht
 * durch die Vision-Pipeline. Der Parser ist header-tolerant (Spalten werden
 * ueber Alias-Listen erkannt, Reihenfolge egal) und mappt jede Datenzeile
 * auf eine synthetische EnergieausweisExtraction, die durch die bestehende
 * normalizeExtraction-Pipeline laeuft - so entstehen dieselben
 * Plausibilitaets-Flags und Notes wie beim PDF-Import.
 */
import {
  normalizeExtraction,
  type EnergieausweisExtraction,
  type NormalizedBuilding,
} from "@/lib/schema";
import { readXlsx, type CellValue, type SheetData } from "@/lib/import/xlsx";

export interface ImportedBuilding {
  rowIndex: number;
  name: string | null;
  extraction: EnergieausweisExtraction;
  normalized: NormalizedBuilding;
}

export interface ImportRowError {
  rowIndex: number;
  message: string;
}

export interface ImportResult {
  sheetName: string;
  buildings: ImportedBuilding[];
  errors: ImportRowError[];
  /** Erkannte Spaltenzuordnung (fuer Anzeige/Debugging). */
  columnMap: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Spalten-Aliase (kleingeschrieben, ohne Sonderzeichen verglichen)
// ---------------------------------------------------------------------------

type FieldKey =
  | "name"
  | "adresse"
  | "strasse"
  | "plz"
  | "ort"
  | "gebaeudetyp"
  | "nutzung"
  | "ausweistyp"
  | "baujahr"
  | "flaeche"
  | "wohnflaeche"
  | "endenergieWaerme"
  | "endenergieStrom"
  | "endenergieGesamt"
  | "primaerenergie"
  | "effizienzklasse"
  | "energietraeger"
  | "thg";

const COLUMN_ALIASES: Record<FieldKey, string[]> = {
  name: ["name", "gebaeudename", "gebaeude", "bezeichnung", "objekt", "objektname", "building name"],
  adresse: ["adresse", "address", "anschrift"],
  strasse: ["strasse", "street", "strasse und hausnummer"],
  plz: ["plz", "postleitzahl", "zip", "postal code"],
  ort: ["ort", "stadt", "city", "gemeinde"],
  gebaeudetyp: ["gebaeudetyp", "gebaeudeart", "building type", "typ"],
  nutzung: ["nutzung", "nutzungsart", "hauptnutzung", "gebaeudekategorie", "kategorie", "usage", "use type", "crrem nutzungsart"],
  ausweistyp: ["ausweistyp", "ausweisart", "certificate type", "epc typ", "energieausweistyp"],
  baujahr: ["baujahr", "construction year", "baujahr gebaeude", "year of construction"],
  flaeche: ["energiebezugsflaeche", "ebf", "bezugsflaeche", "nettogrundflaeche", "ngf", "flaeche", "area", "gross area", "energy reference area"],
  wohnflaeche: ["wohnflaeche", "living area"],
  endenergieWaerme: ["endenergie waerme", "endenergiebedarf waerme", "endenergieverbrauch waerme", "endenergie heizung", "waerme kwh", "final energy heat", "heizenergie"],
  endenergieStrom: ["endenergie strom", "endenergiebedarf strom", "endenergieverbrauch strom", "strom kwh", "final energy electricity"],
  endenergieGesamt: ["endenergie", "endenergie gesamt", "endenergiebedarf", "endenergieverbrauch", "final energy", "endenergiekennwert"],
  primaerenergie: ["primaerenergie", "primaerenergiebedarf", "primaerenergieverbrauch", "primary energy", "pe kennwert", "primaerenergiekennwert"],
  effizienzklasse: ["effizienzklasse", "energieeffizienzklasse", "klasse", "epc", "epc class", "energy class", "label"],
  energietraeger: ["energietraeger", "energietraeger heizung", "heiztraeger", "heizungsart", "energy carrier", "heating carrier", "hauptenergietraeger"],
  thg: ["thg", "treibhausgasemissionen", "co2 emissionen", "co2e", "ghg", "co2 intensitaet", "emissionen"],
};

/** Header normalisieren: klein, Umlaute ausschreiben, nur [a-z0-9 ]. */
function normHeader(v: CellValue): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ") // Einheiten-Suffixe entfernen
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Findet die Header-Zeile (Zeile mit den meisten Alias-Treffern). */
function findHeaderRow(rows: CellValue[][]): {
  headerIndex: number;
  columnMap: Partial<Record<FieldKey, number>>;
} | null {
  let best: { headerIndex: number; columnMap: Partial<Record<FieldKey, number>>; hits: number } | null = null;

  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const map: Partial<Record<FieldKey, number>> = {};
    let hits = 0;
    for (let c = 0; c < row.length; c++) {
      const h = normHeader(row[c]);
      if (!h) continue;
      for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [FieldKey, string[]][]) {
        if (map[field] !== undefined) continue;
        // Exakter Alias-Treffer zuerst, dann Praefix-Treffer
        if (aliases.includes(h) || aliases.some((a) => h.startsWith(a + " ") || h === a)) {
          map[field] = c;
          hits++;
          break;
        }
      }
    }
    if (hits >= 3 && (best === null || hits > best.hits)) {
      best = { headerIndex: r, columnMap: map, hits };
    }
  }
  return best ? { headerIndex: best.headerIndex, columnMap: best.columnMap } : null;
}

function num(v: CellValue): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  // Deutsche Zahlformate ("1.234,5"); falls das fehlschlaegt: Standardparse
  if (Number.isFinite(n)) return n;
  const n2 = Number(v);
  return Number.isFinite(n2) ? n2 : undefined;
}

function str(v: CellValue): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

/** Baut die Adresse aus Einzel- oder Sammelspalten. */
function buildAddress(
  row: CellValue[],
  map: Partial<Record<FieldKey, number>>,
): string | undefined {
  const direct = map.adresse !== undefined ? str(row[map.adresse]) : undefined;
  if (direct) return direct;
  const parts = [
    map.strasse !== undefined ? str(row[map.strasse]) : undefined,
    [
      map.plz !== undefined ? str(row[map.plz]) : undefined,
      map.ort !== undefined ? str(row[map.ort]) : undefined,
    ]
      .filter(Boolean)
      .join(" "),
  ].filter((p) => p && p.length > 0);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function mapGebaeudetyp(
  raw: string | undefined,
  nutzung: string | undefined,
): "Wohngebäude" | "Nichtwohngebäude" {
  const t = (raw ?? nutzung ?? "").toLowerCase();
  if (t.includes("nichtwohn") || t.includes("non-resi") || t.includes("gewerbe"))
    return "Nichtwohngebäude";
  if (t.includes("wohn") || t.includes("resi")) return "Wohngebäude";
  // Default konservativ: Nichtwohngebaeude nur bei klarer Gewerbe-Nutzung
  const n = (nutzung ?? "").toLowerCase();
  if (
    n &&
    ["buero", "büro", "office", "handel", "hotel", "logistik", "lager", "schule", "verwaltung", "gesundheit"].some((k) => n.includes(k))
  )
    return "Nichtwohngebäude";
  return "Wohngebäude";
}

function mapAusweistyp(raw: string | undefined): "Bedarfsausweis" | "Verbrauchsausweis" {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("verbrauch") || t.includes("consumption")) return "Verbrauchsausweis";
  return "Bedarfsausweis";
}

/**
 * Parst einen Predium-Excel-Export (erstes Blatt mit erkennbarer
 * Header-Zeile) zu importierbaren Gebaeuden.
 */
export function parsePrediumExcel(data: Uint8Array): ImportResult {
  const sheets = readXlsx(data);
  if (sheets.length === 0)
    return { sheetName: "", buildings: [], errors: [{ rowIndex: 0, message: "Keine Tabellenblätter gefunden." }], columnMap: {} };

  let chosen: { sheet: SheetData; headerIndex: number; columnMap: Partial<Record<FieldKey, number>> } | null = null;
  for (const sheet of sheets) {
    const found = findHeaderRow(sheet.rows);
    if (found) {
      chosen = { sheet, ...found };
      break;
    }
  }
  if (!chosen)
    return {
      sheetName: sheets[0].name,
      buildings: [],
      errors: [
        {
          rowIndex: 0,
          message:
            "Keine Header-Zeile mit bekannten Spalten gefunden (erwartet z. B. Adresse, Endenergie, Fläche).",
        },
      ],
      columnMap: {},
    };

  const { sheet, headerIndex, columnMap } = chosen;
  const buildings: ImportedBuilding[] = [];
  const errors: ImportRowError[] = [];

  const get = (row: CellValue[], key: FieldKey): CellValue =>
    columnMap[key] !== undefined ? (row[columnMap[key]!] ?? null) : null;

  for (let r = headerIndex + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!row || row.every((c) => c == null || c === "")) continue;

    const adresse = buildAddress(row, columnMap);
    const name = str(get(row, "name")) ?? adresse ?? null;

    const heat = num(get(row, "endenergieWaerme"));
    const elec = num(get(row, "endenergieStrom"));
    const total = num(get(row, "endenergieGesamt"));
    if (heat === undefined && total === undefined) {
      errors.push({
        rowIndex: r + 1,
        message: `Zeile ${r + 1}: keine Endenergie-Angabe – übersprungen.`,
      });
      continue;
    }

    const gebaeudetyp = mapGebaeudetyp(
      str(get(row, "gebaeudetyp")),
      str(get(row, "nutzung")),
    );
    const isWG = gebaeudetyp === "Wohngebäude";
    const flaeche = num(get(row, "flaeche"));
    const wohnflaeche = num(get(row, "wohnflaeche"));
    const traeger = str(get(row, "energietraeger"));

    const extraction: EnergieausweisExtraction = {
      gebaeudetyp,
      ausweistyp: mapAusweistyp(str(get(row, "ausweistyp"))),
      adresse,
      hauptnutzung_gebaeudekategorie: str(get(row, "nutzung")),
      baujahr_gebaeude: num(get(row, "baujahr")),
      energietraeger_heizung: traeger ? [traeger] : [],
      nettogrundflaeche_m2: isWG ? undefined : flaeche,
      gebaeudenutzflaeche_an_m2: isWG ? flaeche : undefined,
      wohnflaeche_m2: wohnflaeche,
      energieeffizienzklasse: str(get(row, "effizienzklasse")),
      primaerenergie_kwh_m2a: num(get(row, "primaerenergie")),
      endenergie_gesamt_kwh_m2a: total,
      endenergie_waerme_kwh_m2a: heat,
      endenergie_strom_kwh_m2a: elec,
      endenergie_wg_einzelwert_kwh_m2a: isWG ? (heat ?? total) : undefined,
      treibhausgasemissionen_kg_co2e_m2a: num(get(row, "thg")),
      endenergie_je_traeger: [],
      modernisierungsempfehlungen: [],
    };

    try {
      const normalized = normalizeExtraction(extraction);
      normalized.notes.push(
        "Importiert aus Predium-Excel-Export (Bulk-Import) – Werte gegen den Original-Export prüfen.",
      );
      buildings.push({ rowIndex: r + 1, name, extraction, normalized });
    } catch (e) {
      errors.push({
        rowIndex: r + 1,
        message: `Zeile ${r + 1}: ${e instanceof Error ? e.message : "Normalisierung fehlgeschlagen."}`,
      });
    }
  }

  const exposedMap: Record<string, number> = {};
  for (const [k, v] of Object.entries(columnMap))
    if (v !== undefined) exposedMap[k] = v;

  return { sheetName: sheet.name, buildings, errors, columnMap: exposedMap };
}
