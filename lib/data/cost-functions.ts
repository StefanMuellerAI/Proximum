/**
 * Kostenfunktions-Datenschicht (GAP-5, Spez. 2.9 + PLAN_DATENBESCHAFFUNG
 * Teil 2): austauschbare Einheitskosten mit Quellenfeld.
 *
 * Quelle: IWU-Kostenfunktionen (Hinz-Studie 2015, Preisstand-Update
 * 2022/2023) - der etablierte freie Standard (vom BBSR auf dem GEG-
 * Infoportal selbst genutzt); Predium nutzt fuer Fernwaerme und
 * hydraulischen Abgleich bereits identische IWU-/Jagnow-Formeln.
 * Eine BKI-Lizenz bleibt spaeterer Drop-in (nur diese Tabelle tauschen).
 *
 * Struktur je Massnahme: Kosten als Funktion der Menge -
 *   linear:    EUR/Einheit = fix + slope x Parameter (z. B. Daemmstaerke cm)
 *   degressiv: EUR = a x Menge^b (Groessendegression)
 *
 * Alle Werte NETTO, Preisstand siehe priceLevel; Indexierung ueber den
 * Destatis-Baupreisindex (BPI, Genesis 61261-0001).
 */

export interface CostFunctionDef {
  measureId: string;
  label: string;
  /** Mengeneinheit der Funktion. */
  unit: "m2_bauteil" | "m2_fenster" | "m2_ebf" | "kw_heizlast" | "kwp" | "stueck" | "klumen";
  kind: "linear" | "degressiv" | "pauschal";
  /** linear: EUR/Einheit = fix + slope x param (param z. B. Daemmstaerke cm). */
  fix?: number;
  slope?: number;
  /** Default-Parameter (z. B. 16 cm Daemmstaerke). */
  defaultParam?: number;
  /** degressiv: EUR = a x Menge^b. */
  a?: number;
  b?: number;
  /** pauschal: EUR je Einheit. */
  perUnit?: number;
  /** Preisstand der Quelle (fuer BPI-Indexierung). */
  priceLevel: string;
  source: string;
}

export const COST_FUNCTIONS: CostFunctionDef[] = [
  {
    measureId: "fassade",
    label: "WDVS Außenwand",
    unit: "m2_bauteil",
    kind: "linear",
    fix: 100,
    slope: 4.5, // EUR je cm Daemmstaerke
    defaultParam: 16,
    priceLevel: "2023",
    source: "IWU 2024 (Hinz-Update 2022/2023), Kostenfunktion Außenwand-WDVS",
  },
  {
    measureId: "dach",
    label: "Dach-/oberste Geschossdecke dämmen",
    unit: "m2_bauteil",
    kind: "linear",
    fix: 90,
    slope: 4.0,
    defaultParam: 20,
    priceLevel: "2023",
    source: "IWU 2024, Mischwert Steildach/oGD",
  },
  {
    measureId: "keller",
    label: "Kellerdecke dämmen (unterseitig)",
    unit: "m2_bauteil",
    kind: "linear",
    fix: 30,
    slope: 2.5,
    defaultParam: 10,
    priceLevel: "2023",
    source: "IWU 2024, Kellerdecke unterseitig",
  },
  {
    measureId: "fenster",
    label: "Fenstertausch 3-fach",
    unit: "m2_fenster",
    kind: "pauschal",
    perUnit: 620, // EUR je m2 Fensterflaeche
    priceLevel: "2023",
    source: "IWU 2024, Fenster Kunststoff 3-fach WSV",
  },
  {
    measureId: "abgleich",
    label: "Hydraulischer Abgleich (mit Ventilen)",
    unit: "m2_ebf",
    kind: "degressiv",
    a: 14.12,
    b: -0.1412, // EUR/m2EBF = 14,12 x EBF^-0,1412 (Jagnow/Wolff)
    priceLevel: "2001",
    source: "Jagnow/Wolff Investitionskostenfunktionen TGA (Predium-identisch)",
  },
  {
    measureId: "lueftung",
    label: "Lüftungsanlage mit WRG (dezentral)",
    unit: "stueck",
    kind: "pauschal",
    perUnit: 4200, // EUR je Geraet/Wohneinheit
    priceLevel: "2023",
    source: "IWU 2024 / Hinz, Lüftung mit WRG dezentral",
  },
  {
    measureId: "led",
    label: "LED-Umrüstung",
    unit: "klumen",
    kind: "pauschal",
    perUnit: 45, // EUR je 1.650 Lumen installiert (Predium-Mengenlogik)
    priceLevel: "2023",
    source: "Branchenwerte Beleuchtungssanierung (frei), Menge = Lumen/1.650",
  },
  {
    measureId: "waermepumpe",
    label: "Luft-Wasser-Wärmepumpe",
    unit: "kw_heizlast",
    kind: "degressiv",
    a: 3200,
    b: 0.65, // EUR = 3.200 x kW^0,65 (Groessendegression)
    priceLevel: "2023",
    source: "IWU/Hinz + BEG-Evaluationsberichte (WP-Marktpreise, degressiv)",
  },
  {
    measureId: "pv",
    label: "Photovoltaik-Anlage",
    unit: "kwp",
    kind: "pauschal",
    perUnit: 1350, // EUR je kWp (Aufdach, netto)
    priceLevel: "2024",
    source: "Fraunhofer ISE 'Aktuelle Fakten zur Photovoltaik'",
  },
  {
    measureId: "fernwaerme",
    label: "Fernwärme-Anschluss",
    unit: "m2_ebf",
    kind: "degressiv",
    a: 143.06,
    b: -0.487, // EUR/m2 = EK x Flaeche^-0,487 (IWU, Predium-identisch)
    priceLevel: "2015",
    source: "IWU-Kostenfunktion Fernwärme (Exponent −0,487, Hinz)",
  },
];

// ---------------------------------------------------------------------------
// Baupreisindex (Destatis Genesis 61261-0001, Wohngebaeude, 2015 = 100)
// ---------------------------------------------------------------------------

/** Jahresmittelwerte; vierteljaehrlicher Abruf via Genesis-API vorgesehen. */
export const BPI_INDEX: Record<string, number> = {
  "2001": 78.5,
  "2015": 100.0,
  "2020": 114.2,
  "2021": 124.8,
  "2022": 144.0,
  "2023": 153.4,
  "2024": 157.9,
  "2024-Q4": 158.9,
  "2025": 161.5,
};

export const BPI_SOURCE =
  "Destatis Genesis-Tabelle 61261-0001 (Baupreisindizes Wohngebäude, 2015 = 100)";

/** Indexierungsfaktor Kosten_heute = Kosten_Preisstand x (BPI_heute / BPI_Preisstand). */
export function bpiFactor(fromLevel: string, toLevel: string): number {
  const from = BPI_INDEX[fromLevel] ?? BPI_INDEX[fromLevel.slice(0, 4)];
  const to = BPI_INDEX[toLevel] ?? BPI_INDEX[toLevel.slice(0, 4)];
  if (!from || !to) return 1;
  return to / from;
}

// ---------------------------------------------------------------------------
// Heizlast-Kennwerte (2.13-9): Bruecke Gebaeudezustand -> Heizungs-Kosten
// ---------------------------------------------------------------------------

/**
 * Spezifische Heizlast (W/m2) je Effizienzklasse (dena-Gebaeudereport/
 * BBSR-Richtwerte, dokumentierte Naeherung).
 */
export const HEAT_LOAD_W_PER_M2: Record<string, number> = {
  "A+": 25,
  A: 35,
  B: 45,
  C: 55,
  D: 70,
  E: 80,
  F: 90,
  G: 100,
  H: 120,
};

/** Heizlast eines Gebaeudes (kW) aus Klasse + Flaeche; Fallback Klasse E. */
export function heatLoadKw(
  epcClass: string | null,
  areaM2: number,
): number {
  const wPerM2 = HEAT_LOAD_W_PER_M2[epcClass ?? "E"] ?? HEAT_LOAD_W_PER_M2.E;
  return (wPerM2 * areaM2) / 1000;
}
