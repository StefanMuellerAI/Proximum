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

export interface CrremResult {
  crremType: CrremType;
  series: YearPoint[];
  strandingYear: number | null;
  /** true = Gebaeude liegt bereits im Startjahr ueber dem Pfad. */
  strandedFromStart: boolean;
  co2IntensityBase: number;
  pathwayBase: number;
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
}
