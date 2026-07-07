import type { NormalizedBuilding } from "@/lib/schema";
import type { AnalysisResult, EnergyState } from "@/lib/engine/types";
import { computeCo2 } from "@/lib/engine/co2";
import { computeCrrem } from "@/lib/engine/crrem";
import { computeCost } from "@/lib/engine/cost";
import { computeCo2Levy } from "@/lib/engine/co2levy";
import { computeTaxonomy } from "@/lib/engine/taxonomy";
import { applyMeasures, summarizeInvestment } from "@/lib/engine/renovation";

export * from "@/lib/engine/types";
export * from "@/lib/engine/renovation";

/** Basis-Energiezustand aus der normalisierten Extraktion. */
export function baseEnergyState(b: NormalizedBuilding): EnergyState {
  return {
    heatKwhM2a: b.heatKwhM2a,
    electricityKwhM2a: b.electricityKwhM2a,
    perCarrier: b.perCarrier.map((s) => ({ ...s })),
  };
}

/** Fuehrt alle Berechnungen fuer einen Energiezustand aus. */
export function analyze(
  building: NormalizedBuilding,
  state: EnergyState,
  opts: { useCertificateCo2: boolean },
): AnalysisResult {
  const co2 = computeCo2(
    state,
    building.bezugsflaecheM2,
    building.thgKgM2a,
    opts.useCertificateCo2,
  );
  const crrem = computeCrrem(state, building.crremType);
  const cost = computeCost(state, building.bezugsflaecheM2);
  const levy = computeCo2Levy(state, building.bezugsflaecheM2);
  const taxonomy = computeTaxonomy(
    building.primaryKwhM2a,
    building.epcClass,
    building.baujahr,
    building.crremType,
  );

  return {
    co2,
    crrem,
    cost,
    levy,
    taxonomy,
    energy: {
      heatKwhM2a: state.heatKwhM2a,
      electricityKwhM2a: state.electricityKwhM2a,
      totalKwhM2a: state.heatKwhM2a + state.electricityKwhM2a,
    },
  };
}

/** Basisanalyse (Ist-Zustand). Nutzt den Ausweis-THG-Wert falls vorhanden. */
export function analyzeBase(building: NormalizedBuilding): AnalysisResult {
  return analyze(building, baseEnergyState(building), {
    useCertificateCo2: true,
  });
}

export interface ScenarioResult {
  result: AnalysisResult;
  investment: ReturnType<typeof summarizeInvestment>;
  /** Einfache Amortisation (Jahre) aus Netto-Invest / jaehrl. Einsparung. */
  paybackYears: number | null;
  annualSavingsEur: number | null;
}

/**
 * Analysiert ein Sanierungsszenario und vergleicht es mit dem Ist-Zustand
 * (fuer Ersparnis/Amortisation).
 */
export function analyzeScenario(
  building: NormalizedBuilding,
  measureIds: string[],
): ScenarioResult {
  const base = analyzeBase(building);
  const state = applyMeasures(
    baseEnergyState(building),
    measureIds,
    building.wwrPercent,
    building.pvYieldKwhPerM2,
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

  return { result, investment, paybackYears, annualSavingsEur };
}
