/**
 * Effizienzklassen-Registry (GAP-1, Spez. 2.2 + 2.13-5).
 *
 * Klassensysteme sind DATEN, kein Code: jedes System traegt seine
 * Grenzwert-Inklusivitaet (boundary), seine Baender und einen
 * Gueltigkeitszeitraum. Ein Systemwechsel (z. B. EPBD-Neuskalierung ~2030,
 * harmonisiertes A-G) ist damit ein Datenimport, kein Deployment.
 */
import type { BoundaryMode, ClassBand } from "@/lib/engine/numerics";

export type ClassCountry = "DE" | "AT" | "PL" | "FR";

export interface ClassSystemDef {
  id: string;
  country: ClassCountry;
  /** Gebaeudetyp-Anwendungsbereich. */
  scope: "WG" | "NWG" | "ALL";
  /**
   * Bezugsgroesse:
   * - heat_end_energy: Endenergie Heizung + Warmwasser (kWh/m2a)
   * - primary_energy:  Primaerenergie (kWh/m2a)
   * - hwb_or_pe:       Heizwaermebedarf bevorzugt, sonst Primaerenergie (AT)
   * - pe_relative:     Vielfache von PE_ref (Fraunhofer/DIN EN ISO 52003-1)
   */
  metric: "heat_end_energy" | "primary_energy" | "hwb_or_pe" | "pe_relative";
  boundary: BoundaryMode;
  /** Baender aufsteigend; bei pe_relative ist max ein Faktor von PE_ref. */
  bands: ClassBand[];
  /** Gueltigkeit (ISO-Datum); null = offen. */
  validFrom: string | null;
  validTo: string | null;
  source: string;
}

export const CLASS_SYSTEMS: ClassSystemDef[] = [
  {
    id: "DE_WG_GEG",
    country: "DE",
    scope: "WG",
    metric: "heat_end_energy",
    boundary: "lte", // GEG: Grenzwert gehoert noch zur Klasse (<=)
    bands: [
      { label: "A+", max: 30 },
      { label: "A", max: 50 },
      { label: "B", max: 75 },
      { label: "C", max: 100 },
      { label: "D", max: 130 },
      { label: "E", max: 160 },
      { label: "F", max: 200 },
      { label: "G", max: 250 },
      { label: "H", max: null },
    ],
    validFrom: "2014-05-01",
    validTo: null,
    source: "GEG Anlage 10 (Endenergie Heizung + Warmwasser)",
  },
  {
    id: "DE_NWG_FRAUNHOFER",
    country: "DE",
    scope: "NWG",
    metric: "pe_relative",
    boundary: "lte",
    bands: [
      { label: "A", max: 0.35 },
      { label: "B", max: 0.5 },
      { label: "C", max: 0.71 },
      { label: "D", max: 1.0 },
      { label: "E", max: 1.41 },
      { label: "F", max: 2.0 },
      { label: "G", max: null },
    ],
    validFrom: null,
    validTo: null,
    source: "Fraunhofer-Methode nach DIN EN ISO 52003-1 (Faktoren von PE_ref)",
  },
  {
    id: "AT_OIB",
    country: "AT",
    scope: "ALL",
    metric: "hwb_or_pe",
    boundary: "lt", // OIB: Grenzwert gehoert bereits zur naechsten Klasse (<)
    bands: [
      { label: "A++", max: 10 },
      { label: "A+", max: 15 },
      { label: "A", max: 25 },
      { label: "B", max: 50 },
      { label: "C", max: 100 },
      { label: "D", max: 150 },
      { label: "E", max: 200 },
      { label: "F", max: 250 },
      { label: "G", max: null },
    ],
    validFrom: null,
    validTo: null,
    source: "OIB-Richtlinie 6 (HWB bevorzugt, sonst Primärenergie)",
  },
  {
    id: "PL_WG",
    country: "PL",
    scope: "WG", // Fuer NWG existiert in PL kein Klassensystem
    metric: "primary_energy",
    boundary: "lt",
    bands: [
      { label: "A", max: 63 },
      { label: "B", max: 157 },
      { label: "C", max: 250 },
      { label: "D", max: 344 },
      { label: "E", max: 438 },
      { label: "F", max: 531 },
      { label: "G", max: null },
    ],
    validFrom: null,
    validTo: null,
    source: "Polnisches Klassensystem (Primärenergie, nur Wohngebäude)",
  },
  {
    id: "FR_DPE_PE",
    country: "FR",
    scope: "ALL",
    metric: "primary_energy",
    boundary: "lte",
    bands: [
      { label: "A", max: 70 },
      { label: "B", max: 110 },
      { label: "C", max: 180 },
      { label: "D", max: 250 },
      { label: "E", max: 330 },
      { label: "F", max: 420 },
      { label: "G", max: null },
    ],
    validFrom: null,
    validTo: null,
    source: "DPE (Primärenergie), légifrance JORFARTI000049446339",
  },
];

/**
 * FR-Doppelkriterium: CO2-Klassengrenzen (kg CO2/m2a) je Gebaeudegruppe.
 * Gruppen: 1 = Wohnen (MFH/SFH), 2 = Buero, 3 = Gesundheit/Hotel/Freizeit/
 * Logistik kalt, 4 = Handel/Logistik warm.
 * Massgeblich ist die SCHLECHTERE der beiden Klassen (PE vs. CO2).
 */
export type FrBuildingGroup = 1 | 2 | 3 | 4;

export const FR_CO2_BANDS: Record<FrBuildingGroup, ClassBand[]> = {
  1: [
    { label: "A", max: 5 },
    { label: "B", max: 10 },
    { label: "C", max: 20 },
    { label: "D", max: 35 },
    { label: "E", max: 55 },
    { label: "F", max: 80 },
    { label: "G", max: null },
  ],
  2: [
    { label: "A", max: 5 },
    { label: "B", max: 15 },
    { label: "C", max: 30 },
    { label: "D", max: 60 },
    { label: "E", max: 100 },
    { label: "F", max: 145 },
    { label: "G", max: null },
  ],
  3: [
    { label: "A", max: 12 },
    { label: "B", max: 30 },
    { label: "C", max: 65 },
    { label: "D", max: 110 },
    { label: "E", max: 160 },
    { label: "F", max: 220 },
    { label: "G", max: null },
  ],
  4: [
    { label: "A", max: 3 },
    { label: "B", max: 10 },
    { label: "C", max: 25 },
    { label: "D", max: 45 },
    { label: "E", max: 70 },
    { label: "F", max: 95 },
    { label: "G", max: null },
  ],
};

/**
 * Fraunhofer-PEF nach Rechtsgrundlage des Ausweises (Waerme / Strom).
 * Jeder Ausweis wird nach dem Recht seines Ausstellungsdatums interpretiert
 * (2.13-5).
 */
export const FRAUNHOFER_PEF: {
  basis: string;
  /** Regex auf den GEG-/EnEV-Stand-Text des Ausweises. */
  match: RegExp;
  waerme: number;
  strom: number;
}[] = [
  { basis: "EnEV 2009", match: /enev[^0-9]*2009|2009/i, waerme: 1.1, strom: 2.7 },
  { basis: "EnEV 2013", match: /enev[^0-9]*2013|2013/i, waerme: 1.1, strom: 2.4 },
  {
    basis: "EnEV 2016",
    match: /enev[^0-9]*(2014|2016)|2014|2016/i,
    waerme: 1.1,
    strom: 1.8,
  },
  { basis: "GEG 2020", match: /geg|202\d|20[3-9]\d/i, waerme: 1.1, strom: 1.8 },
];

/** Default, wenn keine Rechtsgrundlage erkennbar ist: aktuelles GEG. */
export const FRAUNHOFER_PEF_DEFAULT = { basis: "GEG 2020", waerme: 1.1, strom: 1.8 };

/** GEG-Anforderungswert-Faktoren fuer PE_ref bei Bedarfsausweisen. */
export const GEG_REQUIREMENT_FACTORS = {
  /** Neubau: 55 % des Referenzgebaeudes (seit 2023). */
  neubau: 0.55,
  /** Bestand: 140 % des Referenzgebaeudes. */
  bestand: 1.4,
};
