import type { CarrierShare } from "@/lib/schema";
import type { CrremType } from "@/lib/data/reference";

/** Erstes betrachtetes und letztes Jahr (Deckung der CRREM-Pfade). */
export const YEAR_START = 2020;
export const YEAR_END = 2050;

/** Referenzjahr fuer „heutige" Kennzahlen (auf CRREM-Bereich geklemmt). */
export const BASE_YEAR = Math.min(
  YEAR_END,
  Math.max(YEAR_START, new Date().getFullYear()),
);

/** Reiner Energiezustand eines Gebaeudes (veraenderbar durch Sanierung). */
export interface EnergyState {
  heatKwhM2a: number;
  electricityKwhM2a: number;
  perCarrier: CarrierShare[];
}

export interface YearPoint {
  year: number;
  gebaeude: number;
  pfad: number;
}

/** CRREM-Energiepfad-Stranding (EUI, GAP-6). */
export interface CrremEnergyResult {
  series: YearPoint[];
  strandingYear: number | null;
  strandedFromStart: boolean;
  /** Endenergie-Intensitaet im Basisjahr (kWh/m²·a). */
  euiBase: number;
  pathwayBase: number;
}

export interface CrremResult {
  crremType: CrremType;
  series: YearPoint[];
  strandingYear: number | null;
  /** true = Gebaeude liegt bereits im Startjahr ueber dem Pfad. */
  strandedFromStart: boolean;
  co2IntensityBase: number;
  pathwayBase: number;
  /** Zweite Stranding-Dimension: Energiepfad (EUI). */
  energy: CrremEnergyResult;
  /** Verwendete CRREM-Version (verbindlich v2.05, s. Spez. 2.6). */
  version: string;
  /** Flaechenreferenz: NGF (verbrauchsbasiert) oder EBF (bedarfsbasiert). */
  areaReference: "NGF" | "EBF";
  /** true = HDD-Klimanormalisierung angewandt (nur verbrauchsbasiert). */
  climateNormalized: boolean;
}

export interface Co2Result {
  intensityKgM2a: number;
  tonnesPerYear: number | null;
  fromCertificate: boolean;
}

export interface CostResult {
  eurPerYear: number | null;
  eurPerM2Year: number;
  breakdown: { label: string; eurPerYear: number | null }[];
}

export interface Co2LevyResult {
  fossilTonnesPerYear: number | null;
  eurPerYearBase: number | null;
  series: { year: number; eurPerYear: number | null; priceEurPerT: number }[];
}

export interface TaxonomyResult {
  aligned: boolean;
  criterion: string;
  detail: string;
  thresholdKwhM2a: number;
  primaryKwhM2a: number | null;
  /** Top-30 %: "DNSH erfüllt"-Schwelle (Spez. 2.12). */
  top30ThresholdKwhM2a?: number;
  top30Met?: boolean;
}

// ---------------------------------------------------------------------------
// Wertkategorien / Disclaimer-Layer (Spez. 2.13-7 + 1.4a)
// ---------------------------------------------------------------------------

/**
 * Kategorie eines ausgewiesenen Werts. Jede Zahl in UI/Report traegt eine
 * Kategorie; Reports rendern automatisch die passenden Disclaimer.
 */
export type ValueCategory =
  | "messwert" // direkt aus Ausweis/Messung uebernommen
  | "berechnung" // deterministisch aus Eingaben + dokumentierten Faktoren
  | "schaetzung" // Naeherung auf Basis von Durchschnitts-/Referenzwerten
  | "screening" // regelbasiertes Screening, kein Gutachten
  | "bedarfsprognose"; // bedarfsbasierte Zukunftsprognose (Prebound-Risiko)

export const VALUE_CATEGORY_LABELS: Record<ValueCategory, string> = {
  messwert: "Messwert / Ausweiswert",
  berechnung: "Berechnung",
  schaetzung: "Schätzung",
  screening: "Screening",
  bedarfsprognose: "Bedarfsbasierte Prognose",
};

export const VALUE_CATEGORY_DISCLAIMERS: Record<ValueCategory, string> = {
  messwert:
    "Wert direkt aus dem Energieausweis bzw. einer Messung übernommen.",
  berechnung:
    "Deterministisch aus Ausweisdaten und dokumentierten Faktoren berechnet (Quellen siehe Datenstand).",
  schaetzung:
    "Schätzwert auf Basis dokumentierter Durchschnitts- und Referenzwerte; keine verbindliche Kalkulation.",
  screening:
    "Regelbasiertes Screening zur Orientierung – kein Ersatz für eine testierte Prüfung, ein Gutachten oder eine Energieberatung nach GEG § 88. Stranding-Jahre sind Risikoindikatoren, Taxonomie-Ergebnisse ein Screening.",
  bedarfsprognose:
    "Bedarfsbasierte Prognose: Der Energieausweis überschätzt reale Verbräuche unsanierter Gebäude häufig (Prebound-Effekt); nach Sanierung wird oft mehr geheizt als modelliert (Rebound). Einsparungen und Amortisation sind als Bandbreite zu interpretieren.",
};

/** Kategorie je KPI-Block eines AnalysisResult. */
export interface AnalysisCategories {
  energy: ValueCategory;
  co2: ValueCategory;
  crrem: ValueCategory;
  cost: ValueCategory;
  levy: ValueCategory;
  taxonomy: ValueCategory;
}

export interface AnalysisResult {
  co2: Co2Result;
  crrem: CrremResult;
  cost: CostResult;
  levy: Co2LevyResult;
  taxonomy: TaxonomyResult;
  energy: {
    heatKwhM2a: number;
    electricityKwhM2a: number;
    totalKwhM2a: number;
  };
  /**
   * Berechnete Effizienzklasse (GAP-1); null bei Mischgebaeuden oder
   * fehlenden Ausweisdaten. Wird nach jeder Massnahme neu berechnet.
   */
  efficiencyClass: import("@/lib/engine/efficiency-class").EfficiencyClassResult | null;
  /** CO2-Kostenaufteilung Mieter/Vermieter nach CO2KostAufG (GAP-3). */
  co2Split: import("@/lib/engine/co2-cost-split").Co2CostSplitResult;
  /** Wertkategorie je KPI-Block (Disclaimer-Layer, Spez. 2.13-7). */
  categories: AnalysisCategories;
}
