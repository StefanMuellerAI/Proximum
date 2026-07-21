/**
 * Zentrale Referenzdaten (dokumentierte deutsche Standard-Defaults).
 *
 * WICHTIG: Dies sind bewusst gewaehlte, quellenbasierte Naeherungswerte fuer den
 * MVP. Sie sind KEINE amtlich verbindlichen Werte und hier zentral anpassbar.
 * Alle Annahmen sind pro Wert kommentiert; REFERENCE_INFO buendelt Quelle und
 * Datenstand je Datenblock fuer den Report.
 */

// ---------------------------------------------------------------------------
// Quellen & Datenstand (wird im Report ausgewiesen)
// ---------------------------------------------------------------------------

export interface ReferenceSource {
  /** Datenblock, z. B. "CO₂-Faktoren". */
  topic: string;
  source: string;
  /** Datenstand (Jahr/Monat der zugrunde liegenden Daten). */
  asOf: string;
}

export const REFERENCE_INFO: {
  version: string;
  sources: ReferenceSource[];
} = {
  version: "2025-06",
  sources: [
    {
      topic: "CO₂-Faktoren Energieträger",
      source: "GEG Anlage 9 / CO2KostAufG / UBA (gerundete Näherungen)",
      asOf: "2024",
    },
    {
      topic: "Energiepreise",
      source: "BDEW/Statista-Durchschnittswerte (Nichtwohn-/Gewerbebezug)",
      asOf: "2024/2025",
    },
    {
      topic: "CO₂-Preispfad",
      source:
        "Default: BEHG-Festpreise bis 2026, ab 2027 +6,50 €/t p. a. (Fortschreibung); alternativ EU-ETS2-Marktszenario (Annahme)",
      asOf: "2025",
    },
    {
      topic: "EBeV-Emissionsfaktoren (CO₂-Abgabe, CO2KostAufG)",
      source:
        "EBeV 2030 Anlage 2 (ohne Vorkette); Fernwärme: Hilfswert Techem",
      asOf: "2024",
    },
    {
      topic: "CO₂-Kostenaufteilung",
      source:
        "CO2KostAufG (BGBl. I 2022, 2159): 10-Stufenmodell WG (§§ 5–7), NWG 50/50 (§ 8)",
      asOf: "2023",
    },
    {
      topic: "CRREM-Pfade & Netz-Emissionsfaktoren",
      source:
        "CRREM Library: Global Pathways v2.05 + Emission Factors v2.05 (Deutschland, 1,5 °C)",
      asOf: "v2.05 (30.04.2026)",
    },
    {
      topic: "Sanierungskosten & BEG-Förderung",
      source: "BEG EM/WG, dena, Verbraucherzentrale (Branchen-Richtwerte)",
      asOf: "2024",
    },
    {
      topic: "EU-Taxonomie-Schwellen",
      source:
        "Delegierte VO (EU) 2021/2139 Anhang I 7.7; Top-15%-Näherung (dena/BBSR)",
      asOf: "2024-06",
    },
    {
      topic: "Primärenergiefaktoren",
      source: "GEG 2024 Anlage 4 (nicht erneuerbarer Anteil)",
      asOf: "2024",
    },
  ],
};

// ---------------------------------------------------------------------------
// Optionale regionale Verfeinerung (leer = bundesweite Durchschnittswerte)
// ---------------------------------------------------------------------------

/**
 * Regionale Energiepreise (EUR/kWh) als optionale Verfeinerung. Eintraege
 * ueberschreiben CARRIERS[key].priceEurPerKwh, z. B. fuer projektspezifische
 * Tarife oder regionale Durchschnitte.
 */
export const REGIONAL_ENERGY_PRICES: Partial<Record<CarrierKey, number>> = {};

/**
 * Netzspezifische Fernwaerme-Emissionsfaktoren (kg CO2/kWh) als optionale
 * Verfeinerung. Eintraege ueberschreiben CARRIERS[key].co2KgPerKwh, z. B. mit
 * dem zertifizierten Primaerenergie-/EF-Wert des lokalen Waermenetzes.
 */
export const NETWORK_HEAT_CO2_FACTORS: Partial<Record<CarrierKey, number>> = {};

/** Effektiver Energiepreis (regionale Verfeinerung vor Bundesdurchschnitt). */
export function carrierPriceEurPerKwh(key: CarrierKey): number {
  return REGIONAL_ENERGY_PRICES[key] ?? CARRIERS[key].priceEurPerKwh;
}

/** Effektiver CO2-Faktor (netzspezifische Verfeinerung vor Standardwert). */
export function carrierCo2KgPerKwh(key: CarrierKey): number {
  return NETWORK_HEAT_CO2_FACTORS[key] ?? CARRIERS[key].co2KgPerKwh;
}

// ---------------------------------------------------------------------------
// Energietraeger: CO2-Faktoren, Preise, Eigenschaften
// ---------------------------------------------------------------------------

export type CarrierKey =
  | "erdgas"
  | "biomethan"
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
  biomethan: {
    key: "biomethan",
    label: "Biomethan (grünes Gas)",
    // Biogene Verbrennung ~0; Restwert = Vorkette (UBA-Naeherung, analog Holz).
    co2KgPerKwh: 0.06,
    isElectric: false,
    // Nachhaltiges Biomethan ist unter BEHG/EBeV nicht CO2-bepreist (EF 0).
    behgRelevant: false,
    // Erdgaspreis + Gruengas-Aufschlag (Herkunftsnachweis), DE-Naeherung.
    priceEurPerKwh: 0.14,
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

  if (t.includes("biomethan") || t.includes("biogas") || t.includes("grünes gas") || t.includes("gruenes gas") || t.includes("grüngas") || t.includes("gruengas"))
    return "biomethan";
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
// Primaerenergiefaktoren je Energietraeger
// Quelle: GEG 2024 Anlage 4 (nicht erneuerbarer Anteil), gerundete Naeherungen.
// Verwendet, um den Primaerenergiebedarf nach Sanierung naeherungsweise zu
// skalieren (Taxonomie-Ziel im Optimizer).
// ---------------------------------------------------------------------------

export const PRIMARY_ENERGY_FACTORS: Record<CarrierKey, number> = {
  erdgas: 1.1,
  // GEG Anlage 4 Nr. 8 (Biomethan im Bestandskessel): 0,7 (n. erneuerbar)
  biomethan: 0.7,
  fluessiggas: 1.1,
  heizoel: 1.1,
  steinkohle: 1.1,
  braunkohle: 1.2,
  holz: 0.2,
  fernwaerme_kwk: 0.6,
  fernwaerme_fossil: 1.3,
  nahwaerme: 1.1,
  strom_netz: 1.8,
  strom_gruen: 1.8,
  waermepumpe: 1.8,
  solarthermie: 0.0,
  abwaerme: 0.2,
  sonstige: 1.3,
};

// ---------------------------------------------------------------------------
// EBeV-Faktorwelt (CO2-Abgabe + CO2KostAufG, Spez. 2.5): OHNE Vorkette.
// NICHT fuer CO2e-Intensitaeten oder CRREM verwenden (Faktor-Hygiene!).
// ---------------------------------------------------------------------------

/**
 * EBeV-2030-Emissionsfaktoren (kg CO2/kWh, ohne Vorkette).
 * Quellen: EBeV 2030 Anlage 2 (Brennstoffe, aus t CO2/TJ umgerechnet);
 * Fernwaerme: Hilfswert Techem 0,2553 (Spez. 2.3).
 * Traeger ohne Eintrag unterliegen nicht der CO2-Bepreisung.
 */
export const EBEV_CO2_FACTORS: Partial<Record<CarrierKey, number>> = {
  heizoel: 0.2664,
  erdgas: 0.2016,
  fluessiggas: 0.2387,
  // Kohle: 93,5 bzw. 111 t CO2/TJ x 0,0036 TJ/MWh (EBeV/IPCC-Standardwerte)
  steinkohle: 0.3366,
  braunkohle: 0.3996,
  // Fossile Fernwaerme unter EU-ETS: Hilfswert (Techem)
  fernwaerme_fossil: 0.2553,
  // Unbekannter fossiler Traeger: konservative Naeherung (dokumentiert)
  sonstige: 0.25,
};

/** EBeV-Faktor eines Traegers; null = nicht CO2-bepreist. */
export function ebevCo2KgPerKwh(key: CarrierKey): number | null {
  if (!CARRIERS[key].behgRelevant) return null;
  return EBEV_CO2_FACTORS[key] ?? null;
}

// ---------------------------------------------------------------------------
// CO2-Preis-Pfade (Spez. 2.4)
// ---------------------------------------------------------------------------

export type Co2PricePath = "behg" | "ets2_szenario";

/**
 * DEFAULT (Predium-Paritaet, Abnahme 4.2): BEHG-Festpreise bis 2026,
 * ab 2027 +6,50 EUR/t pro Jahr (Predium-Fortschreibung).
 */
export const CO2_PRICE_BEHG: Record<number, number> = (() => {
  const path: Record<number, number> = {
    2020: 25, 2021: 25, 2022: 30, 2023: 30, 2024: 45, 2025: 55, 2026: 65,
  };
  for (let y = 2027; y <= 2050; y++) path[y] = 65 + 6.5 * (y - 2026);
  return path;
})();

/**
 * Waehlbares Szenario: aggressiverer EU-ETS2-Marktpfad (Annahme).
 * Muss im Report als Annahme ausgewiesen werden (Spez. 2.4).
 */
export const CO2_PRICE_ETS2_SZENARIO: Record<number, number> = {
  2020: 25, 2021: 25, 2022: 30, 2023: 30, 2024: 45, 2025: 55, 2026: 60,
  2027: 75, 2028: 90, 2029: 105, 2030: 120, 2031: 130, 2032: 140, 2033: 150,
  2034: 160, 2035: 170, 2036: 180, 2037: 190, 2038: 200, 2039: 210, 2040: 220,
  2041: 225, 2042: 230, 2043: 235, 2044: 240, 2045: 245, 2046: 250, 2047: 255,
  2048: 260, 2049: 265, 2050: 270,
};

/** @deprecated Alias auf den ETS2-Szenario-Pfad (Altnutzung). */
export const CO2_PRICE_EUR_PER_T = CO2_PRICE_ETS2_SZENARIO;

export function co2PriceForYear(
  year: number,
  path: Co2PricePath = "behg",
): number {
  const table = path === "behg" ? CO2_PRICE_BEHG : CO2_PRICE_ETS2_SZENARIO;
  if (table[year] !== undefined) return table[year];
  const years = Object.keys(table).map(Number);
  const min = Math.min(...years);
  const max = Math.max(...years);
  if (year < min) return table[min];
  return table[max];
}

// ---------------------------------------------------------------------------
// EU-Taxonomie (Klimaschutz, Bestandsgebaeude) - MVP-Naeherung
// ---------------------------------------------------------------------------

/**
 * Vereinfachte Alignment-Pruefung (Delegierte VO (EU) 2021/2139, Anhang I,
 * Abschnitt 7.7 "Erwerb von und Eigentum an Gebaeuden"):
 *  - Gebaeude ab Baujahr 2021: Primaerenergiebedarf mind. 10 % unter NZEB
 *    (Anhang I, 7.1) -> hier strengere PED-Schwelle je Nutzungsart.
 *  - Bestand vor 2021: EPC-Klasse A ODER "Top 15%" des nationalen Bestands.
 * "Top 15%" ist ohne amtliche Verteilungsdaten nicht exakt bestimmbar und wird
 * hier durch nutzungsspezifische Primaerenergie-Schwellen angenaehert.
 */
export const TAXONOMY = {
  /** Globaler Fallback-PED-Grenzwert (kWh/m2a), falls keine Nutzungsart bekannt. */
  pedThresholdKwhM2a: 75,
  /** Globaler NZEB-Fallback fuer Neubauten ab 2021. */
  pedThresholdNzebKwhM2a: 55,
  /** EPC-Klassen, die direkt als aligned gelten (Wohngebaeude). */
  alignedEpcClasses: ["A+", "A"] as string[],
  /** Datenstand / Quellenangabe fuer den Report. */
  source:
    "Delegierte VO (EU) 2021/2139 Anhang I 7.7; Top-15%/Top-30%-Schwellen je CRREM-Typ (Deepki 2024, Cushman & Wakefield – Predium-harmonisiert)",
  version: "2026-07",
};

/**
 * Top-15%-Schwellen (kWh PE/m2a) je CRREM-Nutzungsart, DEUTSCHLAND -
 * harmonisiert auf die Predium-Werte (Spez. 2.12; Quellen: Deepki 2024,
 * Cushman & Wakefield): MFH 95 · Buero 119 · Einzelhandel 156 · Hotel 193 ·
 * Gesundheit 159 · Lager 92. Label: Top 15 % = "Wesentlicher Beitrag".
 * LEI hat keinen publizierten DE-Wert -> Einzelhandel-Naeherung
 * (dokumentierte Abweichung).
 */
export const TAXONOMY_PED_TOP15: Record<CrremType, number> = {
  RSF: 95,
  RMF: 95,
  OFF: 119,
  RHS: 156,
  RSM: 156,
  RWB: 156,
  HOT: 193,
  DWC: 92,
  DWW: 92,
  HEC: 159,
  LEI: 156,
};

/**
 * Top-30%-Schwellen (kWh PE/m2a): "DNSH erfuellt"-Label (Spez. 2.12).
 * Gleiche Quellen: MFH 120 · Buero 148 · Einzelhandel 201 · Hotel 255 ·
 * Gesundheit 191 · Lager 126.
 */
export const TAXONOMY_PED_TOP30: Record<CrremType, number> = {
  RSF: 120,
  RMF: 120,
  OFF: 148,
  RHS: 201,
  RSM: 201,
  RWB: 201,
  HOT: 255,
  DWC: 126,
  DWW: 126,
  HEC: 191,
  LEI: 201,
};

/** Renovierung: mind. -30 % Primaerenergiebedarf (Spez. 2.12). */
export const TAXONOMY_RENOVATION_PED_REDUCTION = 0.3;

/**
 * NZEB-Schwellen fuer Neubauten ab 2021 (Anhang I 7.1: mind. 10 % unter NZEB).
 * Naeherung: 75 % der Top-15%-Schwelle (GEG-Neubaustandard liegt deutlich
 * unter dem Bestands-Top-15%).
 */
export function taxonomyNzebThreshold(type: CrremType): number {
  return Math.round(TAXONOMY_PED_TOP15[type] * 0.75);
}

/**
 * Anker-Punkte der Primaerenergie-Verteilung des deutschen Bestands je
 * Nutzungsart fuer die Perzentil-Naeherung ("gehoert zu den besten ~X %").
 *
 * Quelle/Herleitung (dokumentierte Naeherung, Stand 2024):
 *  - p15 = Top-15%-Schwelle (TAXONOMY_PED_TOP15, dena/BBSR-Naeherung)
 *  - p50 = Bestands-Median: ~1,8x der Top-15%-Schwelle (Verteilungsform aus
 *    dena-Gebaeudereport 2024, Effizienzklassen-Verteilung Wohnen; fuer
 *    Nichtwohnen analog aus BBSR/co2online-Benchmarks uebertragen)
 *  - p85 = "schlechteste 15 %": ~3,2x der Top-15%-Schwelle
 * Dazwischen wird stueckweise linear interpoliert; unterhalb des besten
 * Ankers logarithmisch gegen 1 % gekappt.
 */
export const STOCK_PERCENTILE_ANCHORS: {
  percentile: number;
  factorOfTop15: number;
}[] = [
  { percentile: 1, factorOfTop15: 0.4 },
  { percentile: 15, factorOfTop15: 1.0 },
  { percentile: 30, factorOfTop15: 1.3 },
  { percentile: 50, factorOfTop15: 1.8 },
  { percentile: 70, factorOfTop15: 2.5 },
  { percentile: 85, factorOfTop15: 3.2 },
  { percentile: 99, factorOfTop15: 4.5 },
];

// ---------------------------------------------------------------------------
// Mapping: deutsche Gebaeudekategorie -> CRREM-Nutzungsart-Code
// ---------------------------------------------------------------------------

/** CRREM Nutzungsart-Codes (fuer DE verfuegbar, Global Pathways v2.05). */
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
// PV-Potenzial
// ---------------------------------------------------------------------------

/**
 * Typologie-Default fuer den PV-Ertrag (kWh je m² Bezugsflaeche und Jahr),
 * wenn keine Solar-API-Daten vorliegen. Datenbasierte Werte kommen aus
 * lib/solar.ts (Google Solar API).
 */
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
  if (t.includes("schule") || t.includes("kita") || t.includes("kinder") || t.includes("tagesstätte") || t.includes("tagesstaette") || t.includes("bildung") || t.includes("hochschule") || t.includes("universität") || t.includes("universitaet") || t.includes("kindergarten"))
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

  // Fallback ueber Gebaeudetyp. WICHTIG: exakt pruefen – "Nichtwohngebäude"
  // enthaelt ebenfalls die Teilzeichenkette "wohn".
  if ((gebaeudetyp ?? "").toLowerCase().replace(/[^a-zäöü]/g, "") === "wohngebäude")
    return pick("RMF", true);
  return pick("OFF", true);
}

// ---------------------------------------------------------------------------
// BEG-Sanierungsmassnahmen-Katalog
// ---------------------------------------------------------------------------

export interface RenovationMeasure {
  id: string;
  label: string;
  category: "Gebäudehülle" | "Anlagentechnik" | "Erneuerbare Energien" | "Energiebezug";
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
   * Tarifumstellung: ersetzt Traeger 1:1 ohne Aenderung der Endenergie
   * (z. B. Netzstrom -> Gruenstrom, Erdgas -> Biomethan). Wirkt nur, wenn
   * der Quell-Traeger im Gebaeude vorhanden ist.
   */
  switchCarriers?: Partial<Record<CarrierKey, CarrierKey>>;
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
  // Tarifumstellungen (Energiebezug): keine Investition fuer den Eigentuemer,
  // da die (leicht hoeheren) Energiepreise von den Mietern getragen werden.
  // Wirkung: CO2-Faktor des Traegers sinkt -> Stranding-Zeitpunkt verschiebt
  // sich deutlich, ohne bauliche Massnahme.
  {
    id: "gruenstrom",
    label: "Umstellung auf Grünstrom-Tarif",
    category: "Energiebezug",
    description:
      "Netzstrom wird auf zertifizierten Grünstrom umgestellt. Keine Investition – Mehrkosten des Tarifs tragen die Mieter über die Stromkosten.",
    costPerM2: 0,
    subsidyRate: 0.0,
    switchCarriers: { strom_netz: "strom_gruen" },
  },
  {
    id: "gruengas",
    label: "Umstellung auf grünes Gas (Biomethan)",
    category: "Energiebezug",
    description:
      "Erdgasbezug wird auf Biomethan mit Herkunftsnachweis umgestellt. Keine Investition – Mehrkosten des Tarifs tragen die Mieter über die Gaskosten; zusätzlich entfällt die CO₂-Abgabe (BEHG).",
    costPerM2: 0,
    subsidyRate: 0.0,
    switchCarriers: { erdgas: "biomethan" },
  },
];
