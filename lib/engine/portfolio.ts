/**
 * Portfolio-Aggregation: fasst mehrere Gebaeude zu flaechengewichteten
 * Kennzahlen und einer flaechengewichteten CRREM-Kurve zusammen.
 *
 * Gebaeude ohne Bezugsflaeche fliessen nicht in die gewichtete Kurve und die
 * Absolutwerte ein (werden aber in der Liste gefuehrt).
 */
import type { NormalizedBuilding } from "@/lib/schema";
import type { YearPoint } from "@/lib/engine/types";
import { analyzeBase, analyzeScenario } from "@/lib/engine";

export interface PortfolioBuildingInput {
  id: string;
  name: string | null;
  address: string | null;
  normalized: NormalizedBuilding;
  selectedMeasures: string[];
  createdAt: string | Date;
}

export interface PortfolioEntry {
  id: string;
  name: string;
  address: string | null;
  crremType: NormalizedBuilding["crremType"];
  hauptnutzung: string | null;
  areaM2: number | null;
  epcClass: string | null;
  /** Ist-Zustand */
  co2IntensityKgM2a: number;
  co2TonnesPerYear: number | null;
  costEurPerYear: number | null;
  levyEurPerYear: number | null;
  strandingYear: number | null;
  taxonomyAligned: boolean;
  /** Szenario mit den gespeicherten Massnahmen (falls vorhanden) */
  scenarioStrandingYear: number | null;
  measureCount: number;
  createdAt: string | Date;
}

export interface PortfolioAggregation {
  entries: PortfolioEntry[];
  count: number;
  /** Anzahl Gebaeude mit Bezugsflaeche (Basis der gewichteten Werte). */
  weightedCount: number;
  totalAreaM2: number;
  totalCo2TonnesPerYear: number;
  totalCostEurPerYear: number;
  totalLevyEurPerYear: number;
  alignedCount: number;
  earliestStrandingYear: number | null;
  /** Flaechengewichtete CRREM-Kurve (Gebaeude vs. gewichteter Zielpfad). */
  series: YearPoint[];
  /** Erstes Jahr, in dem die gewichtete Intensitaet den gewichteten Pfad reisst. */
  portfolioStrandingYear: number | null;
}

export function aggregatePortfolio(
  inputs: PortfolioBuildingInput[],
): PortfolioAggregation {
  const entries: PortfolioEntry[] = [];
  const weighted: { areaM2: number; series: YearPoint[] }[] = [];

  let totalAreaM2 = 0;
  let totalCo2 = 0;
  let totalCost = 0;
  let totalLevy = 0;
  let alignedCount = 0;
  let earliest: number | null = null;

  for (const input of inputs) {
    const base = analyzeBase(input.normalized);
    const scen =
      input.selectedMeasures.length > 0
        ? analyzeScenario(input.normalized, input.selectedMeasures)
        : null;

    const areaM2 = input.normalized.bezugsflaecheM2;
    const entry: PortfolioEntry = {
      id: input.id,
      name:
        input.name ?? input.address ?? input.normalized.adresse ?? "Unbenannt",
      address: input.address ?? input.normalized.adresse,
      crremType: input.normalized.crremType,
      hauptnutzung: input.normalized.hauptnutzung,
      areaM2,
      epcClass: input.normalized.epcClass,
      co2IntensityKgM2a: base.co2.intensityKgM2a,
      co2TonnesPerYear: base.co2.tonnesPerYear,
      costEurPerYear: base.cost.eurPerYear,
      levyEurPerYear: base.levy.eurPerYearBase,
      strandingYear: base.crrem.strandingYear,
      taxonomyAligned: base.taxonomy.aligned,
      scenarioStrandingYear: scen?.result.crrem.strandingYear ?? null,
      measureCount: input.selectedMeasures.length,
      createdAt: input.createdAt,
    };
    entries.push(entry);

    if (base.co2.tonnesPerYear != null) totalCo2 += base.co2.tonnesPerYear;
    if (base.cost.eurPerYear != null) totalCost += base.cost.eurPerYear;
    if (base.levy.eurPerYearBase != null) totalLevy += base.levy.eurPerYearBase;
    if (base.taxonomy.aligned) alignedCount += 1;
    if (
      base.crrem.strandingYear != null &&
      (earliest == null || base.crrem.strandingYear < earliest)
    )
      earliest = base.crrem.strandingYear;

    if (areaM2 != null && areaM2 > 0) {
      totalAreaM2 += areaM2;
      weighted.push({ areaM2, series: base.crrem.series });
    }
  }

  // Flaechengewichtete Kurve (alle Serien decken dieselben Jahre ab)
  const series: YearPoint[] = [];
  let portfolioStrandingYear: number | null = null;
  if (weighted.length > 0) {
    const n = weighted[0].series.length;
    for (let i = 0; i < n; i++) {
      const year = weighted[0].series[i].year;
      let g = 0;
      let p = 0;
      for (const w of weighted) {
        g += w.series[i].gebaeude * w.areaM2;
        p += w.series[i].pfad * w.areaM2;
      }
      const gebaeude = Number((g / totalAreaM2).toFixed(2));
      const pfad = Number((p / totalAreaM2).toFixed(2));
      series.push({ year, gebaeude, pfad });
      if (portfolioStrandingYear === null && gebaeude > pfad)
        portfolioStrandingYear = year;
    }
  }

  return {
    entries,
    count: entries.length,
    weightedCount: weighted.length,
    totalAreaM2,
    totalCo2TonnesPerYear: totalCo2,
    totalCostEurPerYear: totalCost,
    totalLevyEurPerYear: totalLevy,
    alignedCount,
    earliestStrandingYear: earliest,
    series,
    portfolioStrandingYear,
  };
}
