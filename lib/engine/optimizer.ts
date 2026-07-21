/**
 * Sanierungs-Optimizer: vollstaendige Kombinationssuche ueber den
 * Massnahmen-Katalog (2^n Pakete, n = Katalogumfang) mit waehlbarem Ziel und
 * Zielfunktion, plus Greedy-Roadmap (zeitliche Reihenfolge der Massnahmen).
 *
 * Hinweis: nutzt die vereinfachte deterministische Engine – Ergebnisse sind
 * Orientierung, keine Fachplanung.
 */
import type { NormalizedBuilding } from "@/lib/schema";
import { RENOVATION_MEASURES } from "@/lib/data/reference";
import type { AnalysisResult, EnergyState } from "@/lib/engine/types";
import { YEAR_END } from "@/lib/engine/types";
import {
  analyze,
  analyzeBase,
  baseEnergyState,
  applyMeasures,
  summarizeInvestment,
} from "@/lib/engine";
import { computeTaxonomy } from "@/lib/engine/taxonomy";
import { estimatePrimaryAfter } from "@/lib/engine/primary-energy";
import { analyzeThermal } from "@/lib/engine/thermal";
import { effectivePvYieldKwhPerM2 } from "@/lib/engine/pv";
import type { EnvelopeComponent } from "@/lib/data/reference";

type EnvelopeReductions = Partial<Record<EnvelopeComponent, number>> | null;

export type OptimizerGoal = "stranding" | "taxonomy" | "budget";
export type OptimizerObjective = "minInvest" | "co2PerEuro" | "maxDelay";

export interface OptimizerParams {
  goal: OptimizerGoal;
  /** Ziel "stranding": kein Stranding vor diesem Jahr (Default 2045). */
  targetYear?: number;
  /** Ziel "budget": maximale Netto-Investition in EUR. */
  budgetEur?: number | null;
  /** Zielfunktion fuers Ranking (Default abhaengig vom Ziel). */
  objective?: OptimizerObjective;
}

export interface RankedPackage {
  measureIds: string[];
  labels: string[];
  strandingYear: number | null;
  strandingDelayYears: number;
  co2TonnesPerYear: number | null;
  co2IntensityKgM2a: number;
  co2ReductionKgM2a: number;
  co2ReductionTonnesPerYear: number | null;
  netInvestEur: number | null;
  netInvestPerM2: number;
  annualSavingsEur: number | null;
  paybackYears: number | null;
  /** Netto-Invest je jaehrlich eingesparter Tonne CO2 (EUR/t·a). */
  eurPerTonCo2: number | null;
  taxonomyAlignedEstimated: boolean;
  estimatedPrimaryKwhM2a: number | null;
  feasible: boolean;
}

export interface RoadmapStep {
  year: number;
  measureId: string;
  label: string;
  /** Stranding-Jahr NACH Umsetzung dieser Massnahme (null = kein Stranding). */
  strandingAfter: number | null;
  netInvestEur: number | null;
  co2IntensityAfterKgM2a: number;
}

export interface OptimizerResult {
  goal: OptimizerGoal;
  objective: OptimizerObjective;
  targetYear: number | null;
  budgetEur: number | null;
  best: RankedPackage | null;
  /** Beste Pakete (feasible zuerst), max. 10 Eintraege. */
  ranking: RankedPackage[];
  evaluatedCount: number;
  feasibleCount: number;
  roadmap: RoadmapStep[];
  baseStrandingYear: number | null;
  baseTaxonomyAligned: boolean;
}

function defaultObjective(goal: OptimizerGoal): OptimizerObjective {
  return goal === "budget" ? "co2PerEuro" : "minInvest";
}

/** Alle 2^n Teilmengen der Massnahmen-IDs. */
function allSubsets(ids: string[]): string[][] {
  const out: string[][] = [];
  const n = ids.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const subset: string[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(ids[i]);
    out.push(subset);
  }
  return out;
}

/**
 * Leichtgewichtige Szenario-Bewertung gegen eine EINMAL berechnete Basis
 * (statt analyzeScenario, das die Basisanalyse je Aufruf neu rechnet –
 * bei 2^n − 1 Paketen waeren das ebenso viele unnoetige Basisanalysen).
 */
function evaluateScenario(
  building: NormalizedBuilding,
  base: AnalysisResult,
  baseState: EnergyState,
  measureIds: string[],
  envelopeReductions: EnvelopeReductions = null,
): {
  result: AnalysisResult;
  state: EnergyState;
  investment: ReturnType<typeof summarizeInvestment>;
  annualSavingsEur: number | null;
  paybackYears: number | null;
} {
  const state = applyMeasures(
    baseState,
    measureIds,
    building.wwrPercent,
    effectivePvYieldKwhPerM2(building),
    envelopeReductions,
  );
  const result = analyze(building, state, { useCertificateCo2: false });
  const investment = summarizeInvestment(measureIds, building.bezugsflaecheM2);

  let annualSavingsEur: number | null = null;
  let paybackYears: number | null = null;
  if (
    base.cost.eurPerYear != null &&
    result.cost.eurPerYear != null &&
    base.levy.eurPerYearBase != null &&
    result.levy.eurPerYearBase != null
  ) {
    annualSavingsEur =
      base.cost.eurPerYear -
      result.cost.eurPerYear +
      (base.levy.eurPerYearBase - result.levy.eurPerYearBase);
    if (
      investment.netInvestEur != null &&
      annualSavingsEur > 0 &&
      investment.netInvestEur > 0
    ) {
      paybackYears = investment.netInvestEur / annualSavingsEur;
    }
  }

  return { result, state, investment, annualSavingsEur, paybackYears };
}

function evaluatePackage(
  building: NormalizedBuilding,
  base: AnalysisResult,
  baseState: EnergyState,
  measureIds: string[],
  envelopeReductions: EnvelopeReductions = null,
): RankedPackage {
  const scen = evaluateScenario(
    building,
    base,
    baseState,
    measureIds,
    envelopeReductions,
  );

  const baseStrandingYear = base.crrem.strandingYear;
  const strandingYear = scen.result.crrem.strandingYear;
  const strandingDelayYears =
    (strandingYear ?? YEAR_END + 1) - (baseStrandingYear ?? YEAR_END + 1);

  const co2ReductionKgM2a =
    base.co2.intensityKgM2a - scen.result.co2.intensityKgM2a;
  const co2ReductionTonnesPerYear =
    base.co2.tonnesPerYear != null && scen.result.co2.tonnesPerYear != null
      ? base.co2.tonnesPerYear - scen.result.co2.tonnesPerYear
      : null;

  const eurPerTonCo2 =
    scen.investment.netInvestEur != null &&
    co2ReductionTonnesPerYear != null &&
    co2ReductionTonnesPerYear > 0.001
      ? scen.investment.netInvestEur / co2ReductionTonnesPerYear
      : null;

  const estimatedPrimary =
    measureIds.length === 0
      ? building.primaryKwhM2a
      : estimatePrimaryAfter(building.primaryKwhM2a, baseState, scen.state);
  const taxonomy = computeTaxonomy(
    estimatedPrimary,
    // EPC-Klasse nur im Ist-Zustand anrechnen; nach Sanierung ist die neue
    // Klasse unbekannt -> konservativ ueber die Primaerenergie-Schaetzung.
    measureIds.length === 0 ? building.epcClass : null,
    building.baujahr,
    building.crremType,
  );

  const labels = measureIds.map(
    (id) => RENOVATION_MEASURES.find((m) => m.id === id)?.label ?? id,
  );

  return {
    measureIds,
    labels,
    strandingYear,
    strandingDelayYears,
    co2TonnesPerYear: scen.result.co2.tonnesPerYear,
    co2IntensityKgM2a: scen.result.co2.intensityKgM2a,
    co2ReductionKgM2a,
    co2ReductionTonnesPerYear,
    netInvestEur: scen.investment.netInvestEur,
    netInvestPerM2: scen.investment.netPerM2,
    annualSavingsEur: scen.annualSavingsEur,
    paybackYears: scen.paybackYears,
    eurPerTonCo2,
    taxonomyAlignedEstimated: taxonomy.aligned,
    estimatedPrimaryKwhM2a: estimatedPrimary,
    feasible: false,
  };
}

function isFeasible(
  p: RankedPackage,
  goal: OptimizerGoal,
  targetYear: number,
  budgetEur: number | null,
): boolean {
  switch (goal) {
    case "stranding":
      // Kein Stranding vor dem Zieljahr
      return p.strandingYear == null || p.strandingYear >= targetYear;
    case "taxonomy":
      return p.taxonomyAlignedEstimated;
    case "budget": {
      if (budgetEur == null) return true;
      if (p.netInvestEur != null) return p.netInvestEur <= budgetEur;
      // Ohne Flaeche keine Absolutkosten -> nicht bewertbar
      return false;
    }
  }
}

function compareByObjective(
  a: RankedPackage,
  b: RankedPackage,
  objective: OptimizerObjective,
): number {
  const inf = Number.POSITIVE_INFINITY;
  switch (objective) {
    case "minInvest": {
      const av = a.netInvestEur ?? a.netInvestPerM2;
      const bv = b.netInvestEur ?? b.netInvestPerM2;
      return av - bv;
    }
    case "co2PerEuro": {
      // kleinster EUR je t CO2 zuerst; Pakete ohne Reduktion ans Ende
      return (a.eurPerTonCo2 ?? inf) - (b.eurPerTonCo2 ?? inf);
    }
    case "maxDelay": {
      if (b.strandingDelayYears !== a.strandingDelayYears)
        return b.strandingDelayYears - a.strandingDelayYears;
      // Gleichstand: guenstiger gewinnt
      return (a.netInvestEur ?? a.netInvestPerM2) - (b.netInvestEur ?? b.netInvestPerM2);
    }
  }
}

export function optimize(
  building: NormalizedBuilding,
  params: OptimizerParams,
): OptimizerResult {
  const targetYear = params.targetYear ?? 2045;
  const budgetEur = params.budgetEur ?? null;
  const objective = params.objective ?? defaultObjective(params.goal);

  // Basis EINMAL berechnen und an alle Paket-Bewertungen durchreichen.
  const base = analyzeBase(building);
  const baseState = baseEnergyState(building);
  const baseStrandingYear = base.crrem.strandingYear;

  // Thermisches Modell EINMAL kalibrieren (GAP-2): bauteilscharfe
  // Reduktionen fuer alle Pakete, sonst Heuristik-Fallback.
  const envelopeReductions =
    analyzeThermal(building)?.envelopeReductions ?? null;

  const ids = RENOVATION_MEASURES.map((m) => m.id);
  const subsets = allSubsets(ids).filter((s) => s.length > 0);

  const evaluated = subsets.map((s) => {
    const p = evaluatePackage(building, base, baseState, s, envelopeReductions);
    p.feasible = isFeasible(p, params.goal, targetYear, budgetEur);
    return p;
  });

  const feasible = evaluated
    .filter((p) => p.feasible)
    .sort((a, b) => compareByObjective(a, b, objective));
  const infeasible = evaluated
    .filter((p) => !p.feasible)
    .sort((a, b) => compareByObjective(a, b, objective));

  const best = feasible[0] ?? null;
  const ranking = [...feasible, ...infeasible].slice(0, 10);

  const roadmap = best
    ? buildRoadmap(building, best.measureIds, baseStrandingYear)
    : [];

  return {
    goal: params.goal,
    objective,
    targetYear: params.goal === "stranding" ? targetYear : null,
    budgetEur: params.goal === "budget" ? budgetEur : null,
    best,
    ranking,
    evaluatedCount: evaluated.length,
    feasibleCount: feasible.length,
    roadmap,
    baseStrandingYear,
    baseTaxonomyAligned: base.taxonomy.aligned,
  };
}

/**
 * Greedy-Roadmap: setzt die Massnahmen des Pakets zeitlich so, dass jeweils
 * VOR dem naechsten drohenden Stranding die Massnahme mit den geringsten
 * Kosten je Tonne CO2-Einsparung umgesetzt wird.
 */
export function buildRoadmap(
  building: NormalizedBuilding,
  packageIds: string[],
  baseStrandingYear: number | null,
): RoadmapStep[] {
  const steps: RoadmapStep[] = [];
  const remaining = [...packageIds];
  const current: string[] = [];
  let currentStranding = baseStrandingYear;
  let lastYear = new Date().getFullYear();

  // Basis einmal berechnen; Zwischenzustaende werden gegen sie bewertet.
  const base = analyzeBase(building);
  const baseState = baseEnergyState(building);
  const envelopeReductions =
    analyzeThermal(building)?.envelopeReductions ?? null;

  while (remaining.length > 0) {
    // Kein Stranding mehr -> restliche Massnahmen direkt im Folgejahr buendeln
    const dueYear =
      currentStranding != null
        ? Math.max(lastYear + 1, currentStranding)
        : lastYear + 1;

    // Naechste Massnahme: geringste Netto-Kosten je Tonne CO2-Einsparung
    // (marginal gegenueber dem aktuellen Zustand).
    const currentScen = evaluateScenario(building, base, baseState, current, envelopeReductions);
    let bestId: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const id of remaining) {
      const s = evaluateScenario(building, base, baseState, [...current, id], envelopeReductions);
      const co2Delta =
        currentScen.result.co2.intensityKgM2a - s.result.co2.intensityKgM2a;
      const investDelta =
        s.investment.netPerM2 - currentScen.investment.netPerM2;
      // Kein CO2-Effekt -> ans Ende sortieren (aber dennoch umsetzbar)
      const score =
        co2Delta > 0.001 ? investDelta / co2Delta : Number.POSITIVE_INFINITY - 1;
      if (score < bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    if (!bestId) bestId = remaining[0];

    current.push(bestId);
    remaining.splice(remaining.indexOf(bestId), 1);

    const after = evaluateScenario(building, base, baseState, current, envelopeReductions);
    const measure = RENOVATION_MEASURES.find((m) => m.id === bestId);
    const investStep =
      building.bezugsflaecheM2 != null && measure
        ? measure.costPerM2 * (1 - measure.subsidyRate) * building.bezugsflaecheM2
        : null;

    steps.push({
      year: dueYear,
      measureId: bestId,
      label: measure?.label ?? bestId,
      strandingAfter: after.result.crrem.strandingYear,
      netInvestEur: investStep,
      co2IntensityAfterKgM2a: after.result.co2.intensityKgM2a,
    });

    lastYear = dueYear;
    currentStranding = after.result.crrem.strandingYear;
  }

  return steps;
}
