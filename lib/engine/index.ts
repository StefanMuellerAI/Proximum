import type { NormalizedBuilding } from "@/lib/schema";
import type { AnalysisResult, EnergyState } from "@/lib/engine/types";
import { computeCo2 } from "@/lib/engine/co2";
import { computeCrrem } from "@/lib/engine/crrem";
import { computeCost } from "@/lib/engine/cost";
import { computeCo2Levy } from "@/lib/engine/co2levy";
import { computeTaxonomy } from "@/lib/engine/taxonomy";
import { applyMeasures, summarizeInvestment } from "@/lib/engine/renovation";
import {
  computeEfficiencyClass,
  isMixedUse,
} from "@/lib/engine/efficiency-class";
import { estimatePrimaryAfter } from "@/lib/engine/primary-energy";
import { plzFromAddress } from "@/lib/engine/climate";
import { computeCo2CostSplit } from "@/lib/engine/co2-cost-split";
import { co2PriceForYear, RENOVATION_MEASURES } from "@/lib/data/reference";
import { BASE_YEAR } from "@/lib/engine/types";
import {
  avoidanceCost,
  dynamicPayback,
  packageLifetimeYears,
} from "@/lib/engine/finance";
import { analyzeThermal } from "@/lib/engine/thermal";
import { effectivePvYieldKwhPerM2 } from "@/lib/engine/pv";

export * from "@/lib/engine/types";
export * from "@/lib/engine/renovation";
export * from "@/lib/engine/efficiency-class";
export * from "@/lib/engine/co2-cost-split";

/** Basis-Energiezustand aus der normalisierten Extraktion. */
export function baseEnergyState(b: NormalizedBuilding): EnergyState {
  return {
    heatKwhM2a: b.heatKwhM2a,
    electricityKwhM2a: b.electricityKwhM2a,
    perCarrier: b.perCarrier.map((s) => ({ ...s })),
  };
}

/**
 * Wertkategorien je KPI-Block (Disclaimer-Layer, Spez. 2.13-7).
 * Szenario-Ergebnisse (useCertificateCo2=false nach Massnahmen) sind
 * bedarfsbasierte Prognosen; der Ist-Zustand traegt Ausweis-/Berechnungs-
 * Kategorien. Taxonomie und CRREM-Stranding sind immer Screenings.
 */
function categoriesFor(
  isScenario: boolean,
  co2FromCertificate: boolean,
): import("@/lib/engine/types").AnalysisCategories {
  return {
    energy: isScenario ? "bedarfsprognose" : "messwert",
    co2: isScenario
      ? "bedarfsprognose"
      : co2FromCertificate
        ? "messwert"
        : "berechnung",
    crrem: "screening",
    cost: isScenario ? "bedarfsprognose" : "schaetzung",
    levy: isScenario ? "bedarfsprognose" : "berechnung",
    taxonomy: "screening",
  };
}

/** Fuehrt alle Berechnungen fuer einen Energiezustand aus. */
export function analyze(
  building: NormalizedBuilding,
  state: EnergyState,
  opts: {
    useCertificateCo2: boolean;
    /**
     * Eingefrorenes Annahme-Paket (2.13-4). Ohne Angabe gelten die
     * aktuellen Referenzdaten (Default-Set).
     */
    assumptions?: import("@/lib/data/assumptions").AssumptionSet;
  },
): AnalysisResult {
  const assumptions = opts.assumptions;
  const co2 = computeCo2(
    state,
    building.bezugsflaecheM2,
    building.thgKgM2a,
    opts.useCertificateCo2,
    // EF-Datenbank-Umschaltung (GAP-8): pro Portfolio via Assumption-Set
    assumptions?.efDatabase ? { database: assumptions.efDatabase } : {},
  );
  // CRREM: Verbrauchsausweise gelten als verbrauchsbasiert (HDD-
  // Klimanormalisierung, NGF-Referenz); Bedarfsausweise als bedarfsbasiert
  // (keine Normalisierung, EBF-Referenz) - Spez. 2.6.
  const crrem = computeCrrem(state, building.crremType, {
    consumptionBased: building.ausweistyp === "Verbrauchsausweis",
    plz: plzFromAddress(building.adresse),
  });
  const cost = computeCost(
    state,
    building.bezugsflaecheM2,
    assumptions?.energyPrices,
  );
  const levy = computeCo2Levy(
    state,
    building.bezugsflaecheM2,
    assumptions?.co2PricePath ?? "behg",
  );
  const taxonomy = computeTaxonomy(
    building.primaryKwhM2a,
    building.epcClass,
    building.baujahr,
    building.crremType,
  );

  // Effizienzklasse (GAP-1): im Ist-Zustand aus den Ausweiswerten, im
  // Szenario aus dem veraenderten Energiezustand (PE ueber PE-Faktoren
  // skaliert) - die Klasse wird nach jeder Massnahme NEU berechnet.
  const isScenario = !opts.useCertificateCo2;
  const scenarioPrimary = isScenario
    ? estimatePrimaryAfter(
        building.primaryKwhM2a,
        baseEnergyState(building),
        state,
      )
    : building.primaryKwhM2a;
  // Heizungs-Endenergie fuer die GEG-WG-Klasse: der Strom einer Waermepumpe
  // ist Heizenergie, liegt im Zustand aber im Strom-Topf (Traegerwechsel).
  const heatingEndEnergy =
    state.heatKwhM2a +
    state.perCarrier
      .filter((s) => s.carrier === "waermepumpe")
      .reduce((sum, s) => sum + s.electricityKwhM2a, 0);
  const efficiencyClass = computeEfficiencyClass({
    country: building.country ?? "DE",
    gebaeudetyp: building.gebaeudetyp,
    isMixedUse: isMixedUse(building.hauptnutzung),
    ausweistyp: building.ausweistyp,
    gegStand: building.gegStand,
    heatEndEnergyKwhM2a: heatingEndEnergy,
    primaryEnergyKwhM2a: scenarioPrimary,
    hwbKwhM2a: building.hwbKwhM2a ?? null,
    co2KgM2a: building.thgKgM2a,
    peRefKwhM2a: building.peRefKwhM2a ?? null,
    vergleichswertWaerme: building.vergleichswertWaerme ?? null,
    vergleichswertStrom: building.vergleichswertStrom ?? null,
  });

  // CO2-Kostenaufteilung (GAP-3): WG ueber Wohnflaeche (Fallback
  // Bezugsflaeche), NWG 50/50; Preis = BEHG-Default des Basisjahres.
  const co2Split = computeCo2CostSplit(
    state,
    building.gebaeudetyp,
    building.wohnflaecheM2 ?? building.bezugsflaecheM2,
    co2PriceForYear(BASE_YEAR, assumptions?.co2PricePath ?? "behg"),
  );

  return {
    co2,
    crrem,
    cost,
    levy,
    taxonomy,
    co2Split,
    energy: {
      heatKwhM2a: state.heatKwhM2a,
      electricityKwhM2a: state.electricityKwhM2a,
      totalKwhM2a: state.heatKwhM2a + state.electricityKwhM2a,
    },
    efficiencyClass,
    categories: categoriesFor(isScenario, co2.fromCertificate),
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
  /** Finanzielle KPIs (GAP-4): Vermeidungskosten + dynamische Amortisation. */
  finance: {
    avoidance: import("@/lib/engine/finance").AvoidanceCostResult;
    dynamic: import("@/lib/engine/finance").DynamicPaybackResult;
  };
  /**
   * Thermisches Modell (GAP-2): Kalibrierungsstatus + Protokoll (2.13-11).
   * success=true: Huellmassnahmen bauteilscharf (Bottom-up) bewertet;
   * sonst Fallback auf die Top-down-Heuristik.
   */
  thermal: {
    calibrated: boolean;
    deviation: number;
    protocol: import("@/lib/engine/thermal/model").CalibrationStep[];
  } | null;
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
  const baseState = baseEnergyState(building);

  // Thermisches Modell (GAP-2): Bottom-up bei erfolgreicher Skalierung,
  // sonst Fallback auf die Top-down-Heuristik (Feature-Flag je Gebaeude).
  const thermalAnalysis = analyzeThermal(building);
  const state = applyMeasures(
    baseState,
    measureIds,
    building.wwrPercent,
    // PV: Solar-API/manuell vorrangig; Typologie-Fall ueber die
    // DIN-V-18599-9-Monatsbilanz statt Pauschalertrag (GAP-9)
    effectivePvYieldKwhPerM2(building),
    thermalAnalysis?.envelopeReductions ?? null,
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

  // Finanzielle KPIs (GAP-4): Vermeidungskosten mit Lebensdauer +
  // dynamische Amortisation (Energiepreis +2 %/a, BEHG-CO2-Pfad).
  const measures = RENOVATION_MEASURES.filter((m) =>
    measureIds.includes(m.id),
  );
  const lifetime = packageLifetimeYears(measures);
  const co2SavingTonnes =
    base.co2.tonnesPerYear != null && result.co2.tonnesPerYear != null
      ? base.co2.tonnesPerYear - result.co2.tonnesPerYear
      : null;
  const finance = {
    avoidance: avoidanceCost(
      investment.netInvestEur,
      co2SavingTonnes,
      lifetime,
    ),
    dynamic: dynamicPayback(
      baseState,
      state,
      investment.netInvestEur,
      building.bezugsflaecheM2,
      { demandBased: building.ausweistyp === "Bedarfsausweis" },
    ),
  };

  const thermal = thermalAnalysis
    ? {
        calibrated: thermalAnalysis.calibration.success,
        deviation: thermalAnalysis.calibration.deviation,
        protocol: thermalAnalysis.calibration.protocol,
      }
    : null;

  return { result, investment, paybackYears, annualSavingsEur, finance, thermal };
}
