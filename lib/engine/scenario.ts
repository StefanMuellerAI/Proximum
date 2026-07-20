/**
 * Szenario-Engine (GAP-11): Massnahmenplaene mit UMSETZUNGSDATUM
 * (Zeitachse), Gebaeude-Exklusion (Verkauf/Rueckbau) und
 * Portfolio-Zeitverlaeufe.
 *
 * Zeitanteiligkeit (2.13-10, NUMERICS.md §4):
 *  - Massnahmenwirkung ab dem FOLGEJAHR des Umsetzungsdatums
 *  - Exklusion monatsanteilig im Exklusionsjahr (Auszug Ende Maerz ->
 *    3/12 Gewicht), danach Gewicht 0
 */
import type { NormalizedBuilding } from "@/lib/schema";
import { RENOVATION_MEASURES } from "@/lib/data/reference";
import type { EnergyState } from "@/lib/engine/types";
import { BASE_YEAR, YEAR_END } from "@/lib/engine/types";
import { applyMeasures, baseEnergyState } from "@/lib/engine";
import { co2IntensityForYear } from "@/lib/engine/co2";
import { pathwayForYear } from "@/lib/engine/crrem";
import { analyzeThermal } from "@/lib/engine/thermal";
import { computeEfficiencyClass, isMixedUse } from "@/lib/engine/efficiency-class";
import { summarizeInvestment } from "@/lib/engine/renovation";

export interface PlannedMeasure {
  /** Katalog-ID (RENOVATION_MEASURES) oder "exklusion". */
  measureId: string;
  /** Umsetzungsdatum (ISO); Wirkung ab Folgejahr. */
  implementationDate: string | null;
  costOverrideEur?: number | null;
}

export interface ScenarioBuildingInput {
  id: string;
  name: string | null;
  normalized: NormalizedBuilding;
  measures: PlannedMeasure[];
}

export interface BuildingYearPoint {
  year: number;
  co2IntensityKgM2a: number;
  pathwayKgM2a: number;
  /** Flaechengewicht 0..1 (Exklusion monatsanteilig). */
  weight: number;
  /** Investitionen dieses Jahres (EUR, netto-Naeherung). */
  investEur: number;
  epcClass: string | null;
  stranded: boolean;
}

export interface ScenarioBuildingResult {
  buildingId: string;
  name: string | null;
  series: BuildingYearPoint[];
  strandingYear: number | null;
  excludedFromYear: number | null;
}

/** Jahr, ab dem eine Massnahme wirkt (Folgejahr des Umsetzungsdatums). */
export function effectiveFromYear(implementationDate: string | null): number {
  if (!implementationDate) return BASE_YEAR + 1;
  const d = new Date(implementationDate);
  if (Number.isNaN(d.getTime())) return BASE_YEAR + 1;
  return d.getFullYear() + 1;
}

/** Monatsanteiliges Gewicht im Exklusionsjahr (Auszug Ende Maerz -> 3/12). */
export function exclusionWeight(
  year: number,
  exclusionDate: string | null,
): number {
  if (!exclusionDate) return 1;
  const d = new Date(exclusionDate);
  if (Number.isNaN(d.getTime())) return 1;
  const exYear = d.getFullYear();
  if (year < exYear) return 1;
  if (year > exYear) return 0;
  return (d.getMonth() + 1) / 12;
}

/**
 * Bewertet ein Gebaeude entlang der Zeitachse: je Jahr gelten genau die
 * Massnahmen, deren Wirkjahr erreicht ist; Exklusion reduziert das
 * Flaechengewicht monatsanteilig.
 */
export function evaluateScenarioBuilding(
  input: ScenarioBuildingInput,
): ScenarioBuildingResult {
  const b = input.normalized;
  const baseState = baseEnergyState(b);
  const thermal = analyzeThermal(b);
  const reductions = thermal?.envelopeReductions ?? null;

  const exclusion = input.measures.find((m) => m.measureId === "exklusion");
  const exclusionDate = exclusion?.implementationDate ?? null;
  const physicalMeasures = input.measures.filter(
    (m) => m.measureId !== "exklusion",
  );

  // Massnahmen nach Wirkjahr sortiert; Zustands-Cache je Jahr
  const sorted = [...physicalMeasures].sort(
    (a, c) => effectiveFromYear(a.implementationDate) - effectiveFromYear(c.implementationDate),
  );

  const series: BuildingYearPoint[] = [];
  let strandingYear: number | null = null;
  let stateCache: { key: string; state: EnergyState } | null = null;

  for (let year = BASE_YEAR; year <= YEAR_END; year++) {
    const activeIds = sorted
      .filter((m) => effectiveFromYear(m.implementationDate) <= year)
      .map((m) => m.measureId);
    const key = activeIds.join("|");
    if (!stateCache || stateCache.key !== key) {
      stateCache = {
        key,
        state: applyMeasures(baseState, activeIds, b.wwrPercent, b.pvYieldKwhPerM2, reductions),
      };
    }
    const state = stateCache.state;

    const weight = exclusionWeight(year, exclusionDate);
    const co2 = co2IntensityForYear(state, year, { database: "crrem" });
    const pathway = pathwayForYear(b.crremType, year);
    const stranded = weight > 0 && co2 > pathway;
    if (stranded && strandingYear === null) strandingYear = year;

    // Investitionen im Umsetzungsjahr (Wirkjahr - 1) verbuchen
    let investEur = 0;
    for (const m of sorted) {
      if (effectiveFromYear(m.implementationDate) - 1 !== year) continue;
      if (m.costOverrideEur != null) {
        investEur += m.costOverrideEur;
      } else {
        const inv = summarizeInvestment([m.measureId], b.bezugsflaecheM2);
        investEur += inv.netInvestEur ?? 0;
      }
    }

    const heatingEndEnergy =
      state.heatKwhM2a +
      state.perCarrier
        .filter((s) => s.carrier === "waermepumpe")
        .reduce((sum, s) => sum + s.electricityKwhM2a, 0);
    const epc = computeEfficiencyClass({
      gebaeudetyp: b.gebaeudetyp,
      isMixedUse: isMixedUse(b.hauptnutzung),
      ausweistyp: b.ausweistyp,
      gegStand: b.gegStand,
      heatEndEnergyKwhM2a: heatingEndEnergy,
      primaryEnergyKwhM2a: b.primaryKwhM2a,
      peRefKwhM2a: b.peRefKwhM2a ?? null,
      vergleichswertWaerme: b.vergleichswertWaerme ?? null,
      vergleichswertStrom: b.vergleichswertStrom ?? null,
    });

    series.push({
      year,
      co2IntensityKgM2a: co2,
      pathwayKgM2a: pathway,
      weight,
      investEur,
      epcClass: epc?.label ?? null,
      stranded,
    });
  }

  const exFromYear = exclusionDate ? new Date(exclusionDate).getFullYear() : null;
  return {
    buildingId: input.id,
    name: input.name,
    series,
    strandingYear,
    excludedFromYear: exFromYear,
  };
}

// ---------------------------------------------------------------------------
// Portfolio-Zeitverlaeufe (Zeitverlaufs-Graphen, GAP-11)
// ---------------------------------------------------------------------------

export interface ScenarioTimelinePoint {
  year: number;
  /** Flaechengewichtete CO2-Intensitaet (kg/m2a). */
  co2IntensityKgM2a: number;
  pathwayKgM2a: number;
  /** Kumulierte Investitionen (EUR). */
  cumulativeInvestEur: number;
  investEur: number;
  /** Anzahl gestrandeter (nicht exkludierter) Gebaeude. */
  strandedCount: number;
  /** Effizienzklassen-Verteilung. */
  classDistribution: Record<string, number>;
  /** Aktives (gewichtetes) Flaechenvolumen. */
  activeAreaM2: number;
}

export interface ScenarioEvaluation {
  buildings: ScenarioBuildingResult[];
  timeline: ScenarioTimelinePoint[];
  totalInvestEur: number;
  strandedCount2030: number;
  strandedCount2050: number;
}

/** Bewertet ein ganzes Szenario (alle Gebaeude + Portfolio-Zeitverlauf). */
export function evaluateScenario(
  inputs: ScenarioBuildingInput[],
): ScenarioEvaluation {
  const buildings = inputs.map(evaluateScenarioBuilding);
  const areas = new Map(
    inputs.map((i) => [i.id, i.normalized.bezugsflaecheM2 ?? 0]),
  );

  const timeline: ScenarioTimelinePoint[] = [];
  let cumulativeInvest = 0;

  for (let year = BASE_YEAR; year <= YEAR_END; year++) {
    let weightedCo2 = 0;
    let weightedPath = 0;
    let activeArea = 0;
    let investEur = 0;
    let strandedCount = 0;
    const classDistribution: Record<string, number> = {};

    for (const b of buildings) {
      const point = b.series.find((p) => p.year === year);
      if (!point) continue;
      const area = (areas.get(b.buildingId) ?? 0) * point.weight;
      if (area > 0) {
        weightedCo2 += point.co2IntensityKgM2a * area;
        weightedPath += point.pathwayKgM2a * area;
        activeArea += area;
      }
      investEur += point.investEur;
      if (point.stranded) strandedCount++;
      if (point.epcClass && point.weight > 0)
        classDistribution[point.epcClass] =
          (classDistribution[point.epcClass] ?? 0) + 1;
    }

    cumulativeInvest += investEur;
    timeline.push({
      year,
      co2IntensityKgM2a: activeArea > 0 ? weightedCo2 / activeArea : 0,
      pathwayKgM2a: activeArea > 0 ? weightedPath / activeArea : 0,
      cumulativeInvestEur: cumulativeInvest,
      investEur,
      strandedCount,
      classDistribution,
      activeAreaM2: activeArea,
    });
  }

  const at = (y: number) => timeline.find((p) => p.year === y);
  return {
    buildings,
    timeline,
    totalInvestEur: cumulativeInvest,
    strandedCount2030: at(2030)?.strandedCount ?? 0,
    strandedCount2050: at(2050)?.strandedCount ?? 0,
  };
}

/** Gueltige Massnahmen-IDs fuer Plaene (Katalog + Exklusion). */
export function isValidPlanMeasureId(id: string): boolean {
  return id === "exklusion" || RENOVATION_MEASURES.some((m) => m.id === id);
}

/**
 * Eigene Ziele (bis 5 je KPI, GAP-11): prueft eine Zielliste gegen den
 * Zeitverlauf (z. B. "CO2-Intensitaet <= 12 kg bis 2035").
 */
export interface ScenarioTarget {
  kpi: "co2Intensity" | "strandedCount" | "cumulativeInvest";
  year: number;
  /** Zielwert (kleiner-gleich). */
  maxValue: number;
  label?: string;
}

export function checkTargets(
  evaluation: ScenarioEvaluation,
  targets: ScenarioTarget[],
): { target: ScenarioTarget; actual: number; met: boolean }[] {
  return targets.slice(0, 5).map((target) => {
    const point = evaluation.timeline.find((p) => p.year === target.year);
    const actual =
      target.kpi === "co2Intensity"
        ? (point?.co2IntensityKgM2a ?? NaN)
        : target.kpi === "strandedCount"
          ? (point?.strandedCount ?? NaN)
          : (point?.cumulativeInvestEur ?? NaN);
    return { target, actual, met: Number.isFinite(actual) && actual <= target.maxValue };
  });
}
