/**
 * Zentrale Referenzdaten (dokumentierte deutsche Standard-Defaults).
 *
 * WICHTIG: Dies sind bewusst gewaehlte, quellenbasierte Naeherungswerte fuer den
 * MVP. Sie sind KEINE amtlich verbindlichen Werte und hier zentral anpassbar.
 * Alle Annahmen sind pro Wert kommentiert.
 */

// ---------------------------------------------------------------------------
// Energietraeger: CO2-Faktoren, Preise, Eigenschaften
// ---------------------------------------------------------------------------

export type CarrierKey =
  | "erdgas"
  | "fluessiggas"
  | "heizoel"
  | "steinkohle"
  | "braunkohle"
  | "holz"
  | "fernwaerme_kwk"
  | "fernwaerme_fossil"
  | "nahwaerme"
  | "strom_netz"
  | "strom_gruen"
  | "waermepumpe"
  | "solarthermie"
  | "abwaerme"
  | "sonstige";

export interface Carrier {
  key: CarrierKey;
  label: string;
  /** kg CO2e je kWh Endenergie (Well-to-Use, Naeherung nach GEG/CO2KostAufG/UBA). */
  co2KgPerKwh: number;
  /** true = Endenergie ist Strom -> CO2 folgt dem zeitabhaengigen Netz-Emissionsfaktor (CRREM). */
  isElectric: boolean;
  /** true = unterliegt der nationalen CO2-Bepreisung (BEHG) bzw. ab 2027 EU-ETS2. */
  behgRelevant: boolean;
  /** Endkunden-Energiepreis in EUR je kWh (DE-Durchschnitt 2024/2025, inkl. Abgaben). */
  priceEurPerKwh: number;
}

/**
 * CO2-Faktoren: GEG Anlage 9 / CO2KostAufG / UBA (gerundete Naeherungen).
 * Preise: BDEW/Statista-Durchschnittswerte 2024/2025 (Nichtwohn-/Gewerbebezug).
 */
export const CARRIERS: Record<CarrierKey, Carrier> = {
  erdgas: {
    key: "erdgas",
    label: "Erdgas",
    co2KgPerKwh: 0.201,
    isElectric: false,
    behgRelevant: true,
    priceEurPerKwh: 0.11,
  },
  fluessiggas: {
    key: "fluessiggas",
    label: "Flüssiggas",
    co2KgPerKwh: 0.234,
    isElectric: false,
    behgRelevant: true,
    priceEurPerKwh: 0.13,
  },
  heizoel: {
    key: "heizoel",
    label: "Heizöl EL",
    co2KgPerKwh: 0.266,
    isElectric: false,
    behgRelevant: true,
    priceEurPerKwh: 0.11,
  },
  steinkohle: {
    key: "steinkohle",
    label: "Steinkohle",
    co2KgPerKwh: 0.335,
    isElectric: false,
    behgRelevant: true,
    priceEurPerKwh: 0.06,
  },
  braunkohle: {
    key: "braunkohle",
    label: "Braunkohle",
    co2KgPerKwh: 0.407,
    isElectric: false,
    behgRelevant: true,
    priceEurPerKwh: 0.05,
  },
  holz: {
    key: "holz",
    label: "Holz / Biomasse",
    co2KgPerKwh: 0.027,
    isElectric: false,
    behgRelevant: false,
    priceEurPerKwh: 0.08,
  },
  fernwaerme_kwk: {
    key: "fernwaerme_kwk",
    label: "Fernwärme (KWK)",
    co2KgPerKwh: 0.15,
    isElectric: false,
    behgRelevant: false,
    priceEurPerKwh: 0.13,
  },
  fernwaerme_fossil: {
    key: "fernwaerme_fossil",
    label: "Fernwärme (fossil)",
    co2KgPerKwh: 0.28,
    isElectric: false,
    behgRelevant: true,
    priceEurPerKwh: 0.13,
  },
  nahwaerme: {
    key: "nahwaerme",
    label: "Nahwärme",
    co2KgPerKwh: 0.2,
    isElectric: false,
    behgRelevant: false,
    priceEurPerKwh: 0.13,
  },
  strom_netz: {
    key: "strom_netz",
    label: "Strom (Netzmix)",
    // Statischer Fallback; die Engine nutzt fuer Projektionen den CRREM-Netz-EF.
    co2KgPerKwh: 0.38,
    isElectric: true,
    behgRelevant: false,
    priceEurPerKwh: 0.3,
  },
  strom_gruen: {
    key: "strom_gruen",
    label: "Strom (Grünstrom)",
    co2KgPerKwh: 0.02,
    isElectric: true,
    behgRelevant: false,
    priceEurPerKwh: 0.32,
  },
  waermepumpe: {
    key: "waermepumpe",
    label: "Umweltwärme (Wärmepumpe)",
    // Endenergie einer WP ist Strom -> CO2 ueber Netz-EF; Preis oft WP-Tarif.
    co2KgPerKwh: 0.38,
    isElectric: true,
    behgRelevant: false,
    priceEurPerKwh: 0.28,
  },
  solarthermie: {
    key: "solarthermie",
    label: "Solarthermie",
    co2KgPerKwh: 0.0,
    isElectric: false,
    behgRelevant: false,
    priceEurPerKwh: 0.0,
  },
  abwaerme: {
    key: "abwaerme",
    label: "Abwärme / WRG",
    co2KgPerKwh: 0.0,
    isElectric: false,
    behgRelevant: false,
    priceEurPerKwh: 0.02,
  },
  sonstige: {
    key: "sonstige",
    label: "Sonstige",
    co2KgPerKwh: 0.25,
    isElectric: false,
    behgRelevant: true,
    priceEurPerKwh: 0.15,
  },
};

/**
 * Ordnet freien Energietraeger-Text aus dem Ausweis einem CarrierKey zu.
 * Tolerant gegenueber Schreibweisen (z. B. "Erdgas (kWh Brennwert)" -> erdgas).
 */
export function matchCarrier(text: string | null | undefined): CarrierKey {
  const t = (text ?? "").toLowerCase().replace(/[-_/]/g, " ");
  if (!t.trim()) return "sonstige";

  // Strom-Varianten
  if (t.includes("grünstrom") || t.includes("gruenstrom") || t.includes("herkunftsnachweis") || t.includes("ökostrom") || t.includes("oekostrom"))
    return "strom_gruen";
  if (t.includes("wärmepumpe") || t.includes("waermepumpe") || t.includes("umweltwärme") || t.includes("umweltwaerme") || t.includes("erdwärme") || t.includes("erdwaerme") || t.includes("geothermie"))
    return "waermepumpe";

  // Fern-/Nahwaerme ZUERST pruefen (Text enthaelt sonst oft "erdgas"/"kohle" als Quelle)
  const isFern = t.includes("fernwärme") || t.includes("fernwaerme") || t.includes("fernheiz") || t.includes("fern wärme") || t.includes("fern waerme") || t.includes("district");
  const isNah = t.includes("nahwärme") || t.includes("nahwaerme") || t.includes("nah wärme") || t.includes("nah waerme") || t.includes("wärmeliefer") || t.includes("waermeliefer");
  if ((isFern || isNah) && (t.includes("kwk") || t.includes("kraft wärme") || t.includes("kraft waerme") || t.includes("kraftwärme") || t.includes("kraftwaerme") || t.includes("bhkw")))
    return "fernwaerme_kwk";
  if (isFern) return "fernwaerme_fossil";
  if (isNah) return "nahwaerme";

  if (t.includes("solar")) return "solarthermie";
  if (t.includes("abwärme") || t.includes("abwaerme") || t.includes("wrg") || t.includes("wärmerück") || t.includes("waermerueck"))
    return "abwaerme";
  if (t.includes("strom")) return "strom_netz";

  if (t.includes("flüssiggas") || t.includes("fluessiggas") || t.includes("lpg") || t.includes("propan") || t.includes("butan"))
    return "fluessiggas";
  if (t.includes("erdgas") || t.includes("cng") || (t.includes("gas") && !t.includes("flüssig") && !t.includes("fluessig")))
    return "erdgas";
  if (t.includes("heizöl") || t.includes("heizoel") || t.includes("öl") || t.includes("oel")) return "heizoel";
  if (t.includes("braunkohle")) return "braunkohle";
  if (t.includes("steinkohle") || t.includes("kohle") || t.includes("koks")) return "steinkohle";
  if (t.includes("holz") || t.includes("pellet") || t.includes("biomasse") || t.includes("hackschnitzel") || t.includes("scheitholz"))
    return "holz";

  return "sonstige";
}

// ---------------------------------------------------------------------------
// CO2-Preis-Pfad (nationale CO2-Bepreisung BEHG, ab 2027 EU-ETS2-Annahme)
// ---------------------------------------------------------------------------

/**
 * Preis je Tonne CO2 (EUR/t).
 * 2021-2026: gesetzliche BEHG-Festpreise / Auktionskorridor.
 * Ab 2027: EU-ETS2 -> Markt; hier konservatives Anstiegsszenario (Annahme).
 */
export const CO2_PRICE_EUR_PER_T: Record<number, number> = {
  2020: 25, 2021: 25, 2022: 30, 2023: 30, 2024: 45, 2025: 55, 2026: 60,
  2027: 75, 2028: 90, 2029: 105, 2030: 120, 2031: 130, 2032: 140, 2033: 150,
  2034: 160, 2035: 170, 2036: 180, 2037: 190, 2038: 200, 2039: 210, 2040: 220,
  2041: 225, 2042: 230, 2043: 235, 2044: 240, 2045: 245, 2046: 250, 2047: 255,
  2048: 260, 2049: 265, 2050: 270,
};

export function co2PriceForYear(year: number): number {
  if (CO2_PRICE_EUR_PER_T[year] !== undefined) return CO2_PRICE_EUR_PER_T[year];
  const years = Object.keys(CO2_PRICE_EUR_PER_T).map(Number);
  const min = Math.min(...years);
  const max = Math.max(...years);
  if (year < min) return CO2_PRICE_EUR_PER_T[min];
  return CO2_PRICE_EUR_PER_T[max];
}

// ---------------------------------------------------------------------------
// EU-Taxonomie (Klimaschutz, Bestandsgebaeude) - MVP-Naeherung
// ---------------------------------------------------------------------------

/**
 * Vereinfachte Alignment-Pruefung (Delegierte VO 2021/2139, Anhang I, 7.7):
 *  - Gebaeude ab Baujahr 2021: NZEB (hier: PED-Schwelle streng).
 *  - Bestand vor 2021: EPC-Klasse A ODER "Top 15%" des nationalen Bestands.
 * "Top 15%" ist ohne nationale Verteilungsdaten nicht exakt bestimmbar und wird
 * hier durch eine Primaerenergie-Schwelle angenaehert (dokumentierte Annahme).
 */
export const TAXONOMY = {
  /** PED-Grenzwert (kWh/m2a) als Naeherung fuer "Top 15%" / NZEB-nah. */
  pedThresholdKwhM2a: 75,
  /** Strengere NZEB-Schwelle fuer Neubauten ab 2021. */
  pedThresholdNzebKwhM2a: 55,
  /** EPC-Klassen, die direkt als aligned gelten (Wohngebaeude). */
  alignedEpcClasses: ["A+", "A"] as string[],
};

// ---------------------------------------------------------------------------
// Mapping: deutsche Gebaeudekategorie -> CRREM-Nutzungsart-Code
// ---------------------------------------------------------------------------

/** CRREM V2.04 Nutzungsart-Codes (fuer DE verfuegbar). */
export type CrremType =
  | "RSF" // Residential Single Family
  | "RMF" // Residential Multi Family
  | "OFF" // Office
  | "RHS" // Retail High Street
  | "RSM" // Retail Shopping Center / Mall
  | "RWB" // Retail Warehouse
  | "HOT" // Hotel
  | "DWC" // Distribution Warehouse (cooled)
  | "DWW" // Distribution Warehouse (warm)
  | "HEC" // Healthcare
  | "LEI"; // Leisure

export const CRREM_TYPE_LABELS: Record<CrremType, string> = {
  RSF: "Wohnen – Einfamilienhaus",
  RMF: "Wohnen – Mehrfamilienhaus",
  OFF: "Büro",
  RHS: "Einzelhandel (Geschäftsstraße)",
  RSM: "Einzelhandel (Center/Mall)",
  RWB: "Einzelhandel (Fachmarkt/Lager)",
  HOT: "Hotel / Beherbergung",
  DWC: "Logistik (gekühlt)",
  DWW: "Logistik (beheizt)",
  HEC: "Gesundheit / Pflege",
  LEI: "Freizeit / Kultur / Sport",
};

// ---------------------------------------------------------------------------
// Gebaeudehuelle: typischer Fensteranteil (WWR) & U-Werte
// ---------------------------------------------------------------------------

/**
 * Typischer Fenster-zu-Wand-Anteil (WWR) je Nutzungsart in Prozent.
 * Dient als Fallback, wenn kein verlaessliches Fassadenbild vorliegt
 * (dokumentierte Branchen-Naeherung).
 */
export const TYPICAL_WWR: Record<CrremType, number> = {
  RSF: 20,
  RMF: 25,
  OFF: 40,
  RHS: 55,
  RSM: 30,
  RWB: 15,
  HOT: 35,
  DWC: 8,
  DWW: 8,
  HEC: 30,
  LEI: 30,
};

export type EnvelopeComponent = "window" | "wall" | "roof" | "floor";

/**
 * Typische U-Werte (W/m²K) je Bauteil: Bestand (unsaniert) vs. saniert.
 * GEG-/Bestands-Richtwerte, Naeherung fuer die Wirkung von Huellen-Massnahmen.
 */
export const U_VALUES: Record<EnvelopeComponent, { alt: number; neu: number }> = {
  window: { alt: 2.7, neu: 0.9 },
  wall: { alt: 1.0, neu: 0.24 },
  roof: { alt: 0.6, neu: 0.18 },
  floor: { alt: 0.8, neu: 0.3 },
};

// ---------------------------------------------------------------------------
// PV-Potenzial (aus Luftbild-Dacheignung abgeleitet)
// ---------------------------------------------------------------------------

export type PvEignung = "hoch" | "mittel" | "gering";

/**
 * PV-Ertrag, der Netzstrom ersetzt (kWh je m² Bezugsflaeche und Jahr), je nach
 * Dacheignung. Naeherung: koppelt Dachflaeche/Ausrichtung an eine Einsparung
 * bezogen auf die Bezugsflaeche (dokumentierte Heuristik).
 */
export const PV_YIELD_BY_EIGNUNG: Record<PvEignung, number> = {
  hoch: 35,
  mittel: 20,
  gering: 8,
};

/** Typologie-Default fuer den PV-Ertrag, wenn kein Luftbild vorliegt. */
export const TYPICAL_PV_YIELD_KWH_M2A = 20;

/**
 * Leitet aus der Hauptnutzung/Gebaeudekategorie einen CRREM-Code ab.
 * Hinweis: CRREM V2.04 kennt KEINE eigene Bildungs-Nutzungsart -> Schulen/Kitas
 * werden naeherungsweise als Buero (OFF) behandelt (aehnliches Nutzungsprofil).
 */
export function mapToCrremType(
  hauptnutzung: string | null | undefined,
  gebaeudetyp?: string | null,
): { code: CrremType; approximated: boolean } {
  const t = (hauptnutzung ?? "").toLowerCase();

  const pick = (code: CrremType, approx = false) => ({ code, approximated: approx });

  if (t.includes("büro") || t.includes("buero") || t.includes("verwaltung") || t.includes("amt"))
    return pick("OFF");
  if (t.includes("hotel") || t.includes("beherberg") || t.includes("pension")) return pick("HOT");
  if (t.includes("krankenhaus") || t.includes("klinik") || t.includes("pflege") || t.includes("gesundheit") || t.includes("ärzte") || t.includes("aerzte"))
    return pick("HEC");
  if (t.includes("schule") || t.includes("kita") || t.includes("bildung") || t.includes("hochschule") || t.includes("universität") || t.includes("universitaet") || t.includes("kindergarten"))
    return pick("OFF", true); // Naeherung: keine Bildungsklasse in CRREM V2.04
  if (t.includes("sport") || t.includes("freizeit") || t.includes("kultur") || t.includes("museum") || t.includes("theater") || t.includes("schwimm") || t.includes("halle"))
    return pick("LEI");
  if (t.includes("gastro") || t.includes("restaurant") || t.includes("gaststätte") || t.includes("gaststaette"))
    return pick("LEI", true);
  if (t.includes("einkaufs") || t.includes("shopping") || t.includes("center") || t.includes("mall"))
    return pick("RSM");
  if (t.includes("fachmarkt") || t.includes("baumarkt")) return pick("RWB");
  if (t.includes("handel") || t.includes("laden") || t.includes("geschäft") || t.includes("geschaeft") || t.includes("verkauf") || t.includes("retail"))
    return pick("RHS");
  if (t.includes("kühl") || t.includes("kuehl") || t.includes("tiefkühl") || t.includes("tiefkuehl"))
    return pick("DWC");
  if (t.includes("logistik") || t.includes("lager") || t.includes("distribution") || t.includes("halle"))
    return pick("DWW");
  if (t.includes("einfamilien") || t.includes("efh") || t.includes("reihenhaus") || t.includes("doppelhaus"))
    return pick("RSF");
  if (t.includes("mehrfamilien") || t.includes("mfh") || t.includes("wohn") || t.includes("apartment") || t.includes("geschosswohnung"))
    return pick("RMF");

  // Fallback ueber Gebaeudetyp
  if ((gebaeudetyp ?? "").toLowerCase().includes("wohn")) return pick("RMF", true);
  return pick("OFF", true);
}

// ---------------------------------------------------------------------------
// BEG-Sanierungsmassnahmen-Katalog
// ---------------------------------------------------------------------------

export interface RenovationMeasure {
  id: string;
  label: string;
  category: "Gebäudehülle" | "Anlagentechnik" | "Erneuerbare Energien";
  description: string;
  /** Investitionskosten in EUR je m2 Bezugsflaeche (Richtwert brutto). */
  costPerM2: number;
  /** BEG-Foerderquote (Anteil 0..1) als Naeherung. */
  subsidyRate: number;
  /**
   * Huellen-Bauteil: wenn gesetzt, wird die Waermeminderung WWR-abhaengig aus dem
   * Transmissionsmodell (lib/engine/envelope.ts) berechnet und ueberschreibt
   * heatReductionPct. heatReductionPct dient dann nur als Fallback (ohne WWR-Kontext).
   */
  envelopeComponent?: EnvelopeComponent;
  /** Relative Minderung der Endenergie fuer Heizung+Warmwasser (0..1). */
  heatReductionPct?: number;
  /** Relative Minderung der Strom-Endenergie (0..1), z. B. LED. */
  electricityReductionPct?: number;
  /** Wechsel des Waerme-Energietraegers (z. B. Gas -> Waermepumpe). */
  switchHeatCarrierTo?: CarrierKey;
  /**
   * Faktor auf die Waerme-Endenergie beim Traegerwechsel.
   * Beispiel Gas->WP: gleiche Nutzwaerme, aber Strom = Waerme / JAZ ~3,5 -> ~0.28.
   */
  heatEndenergieFactor?: number;
  /** PV-Ertrag in kWh/m2a, der Netzstrom-Endenergie ersetzt. */
  pvYieldKwhPerM2?: number;
}

/**
 * Richtwerte fuer Kosten/Einsparung/Foerderung sind Branchen-Naeherungen
 * (BEG EM/WG, dena, Verbraucherzentrale) und dienen der Simulation, nicht der
 * verbindlichen Kostenschaetzung.
 */
export const RENOVATION_MEASURES: RenovationMeasure[] = [
  {
    id: "fassade",
    label: "Fassadendämmung (WDVS)",
    category: "Gebäudehülle",
    description: "Dämmung der Außenwände, reduziert Transmissionsverluste.",
    costPerM2: 150,
    subsidyRate: 0.15,
    envelopeComponent: "wall",
    heatReductionPct: 0.19,
  },
  {
    id: "dach",
    label: "Dach-/Obergeschossdämmung",
    category: "Gebäudehülle",
    description: "Dämmung von Dach bzw. oberster Geschossdecke.",
    costPerM2: 60,
    subsidyRate: 0.15,
    envelopeComponent: "roof",
    heatReductionPct: 0.1,
  },
  {
    id: "keller",
    label: "Kellerdecken-/Sohlendämmung",
    category: "Gebäudehülle",
    description: "Dämmung gegen unbeheizte Bereiche.",
    costPerM2: 40,
    subsidyRate: 0.15,
    envelopeComponent: "floor",
    heatReductionPct: 0.05,
  },
  {
    id: "fenster",
    label: "Fenstertausch (3-fach-Verglasung)",
    category: "Gebäudehülle",
    description: "Austausch alter Fenster gegen Wärmeschutzverglasung.",
    costPerM2: 90,
    subsidyRate: 0.15,
    envelopeComponent: "window",
    heatReductionPct: 0.12,
  },
  {
    id: "abgleich",
    label: "Hydraulischer Abgleich & Optimierung",
    category: "Anlagentechnik",
    description: "Optimierung der Wärmeverteilung, geringe Investition.",
    costPerM2: 15,
    subsidyRate: 0.15,
    heatReductionPct: 0.08,
  },
  {
    id: "lueftung",
    label: "Lüftungsanlage mit Wärmerückgewinnung",
    category: "Anlagentechnik",
    description: "Reduziert Lüftungswärmeverluste.",
    costPerM2: 60,
    subsidyRate: 0.15,
    heatReductionPct: 0.1,
  },
  {
    id: "led",
    label: "LED-Beleuchtung mit Präsenzregelung",
    category: "Anlagentechnik",
    description: "Senkt den Strombedarf für Beleuchtung (v. a. Nichtwohngebäude).",
    costPerM2: 25,
    subsidyRate: 0.15,
    electricityReductionPct: 0.35,
  },
  {
    id: "waermepumpe",
    label: "Wärmepumpe statt Gas-/Ölkessel",
    category: "Erneuerbare Energien",
    description:
      "Ersetzt fossilen Wärmeerzeuger; Wärme wird mit Strom (JAZ ~3,5) bereitgestellt.",
    costPerM2: 120,
    subsidyRate: 0.5,
    switchHeatCarrierTo: "waermepumpe",
    heatEndenergieFactor: 0.28,
  },
  {
    id: "pv",
    label: "Photovoltaik-Anlage (Eigenstrom)",
    category: "Erneuerbare Energien",
    description: "Deckt einen Teil des Strombedarfs, reduziert Netzbezug.",
    costPerM2: 45,
    subsidyRate: 0.0,
    pvYieldKwhPerM2: 20,
  },
];
