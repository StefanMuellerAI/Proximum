/**
 * Finanzielle KPIs (GAP-4, Spez. 2.8):
 *
 * - CO2-Vermeidungskosten MIT Massnahmen-Lebensdauer im Nenner (bewusste
 *   Verbesserung gegenueber Predium, Spez. 1.4b):
 *   Vermeidungskosten [EUR/t] = Netto-Invest / (CO2-Einsparung/a x Lebensdauer)
 *   Zusaetzlich der Predium-kompatible Jahreswert [EUR/(t*a)] ohne Lebensdauer.
 * - Dynamische Amortisation: Energiepreis(t) = Preis_Basis x 1,02^(t-Basis),
 *   CO2-Kosten folgen dem CO2-Preispfad; Amortisation = erstes Jahr, in dem
 *   die kumulierten Einsparungen die Netto-Investition decken.
 * - Prebound-Bandbreite (Spez. 1.4a): bedarfsbasierte Einsparungen werden
 *   als Korridor ausgewiesen (Baseline-Korrektur 0,7-1,0; Literaturwerte
 *   IWU/Sunikka-Blank & Galvin: realer Verbrauch oft 20-40 % unter Bedarf).
 */
import {
  carrierPriceEurPerKwh,
  co2PriceForYear,
  ebevCo2KgPerKwh,
  type Co2PricePath,
} from "@/lib/data/reference";
import type { EnergyState } from "@/lib/engine/types";
import { BASE_YEAR } from "@/lib/engine/types";

/** Jaehrliche Energiepreissteigerung (Spez. 2.8). */
export const ENERGY_PRICE_ESCALATION = 1.02;

/** Prebound-Korrekturfaktor auf bedarfsbasierte Baselines (Untergrenze). */
export const PREBOUND_FACTOR_LOW = 0.7;

/** Default-Lebensdauern je Massnahme (Jahre; dena/BEG-Richtwerte). */
export const MEASURE_LIFETIME_YEARS: Record<string, number> = {
  fassade: 40,
  dach: 40,
  keller: 40,
  fenster: 30,
  abgleich: 15,
  lueftung: 20,
  led: 15,
  waermepumpe: 20,
  pv: 25,
};

/** Gewichtete (invest-anteilige) Lebensdauer eines Massnahmenpakets. */
export function packageLifetimeYears(
  measures: { id: string; costPerM2: number }[],
): number {
  if (measures.length === 0) return 0;
  let invest = 0;
  let weighted = 0;
  for (const m of measures) {
    const life = MEASURE_LIFETIME_YEARS[m.id] ?? 20;
    invest += m.costPerM2;
    weighted += m.costPerM2 * life;
  }
  return invest > 0 ? weighted / invest : 20;
}

export interface AvoidanceCostResult {
  /** EUR je vermiedene Tonne CO2 ueber die Lebensdauer (Proximum-Methodik). */
  eurPerTonneLifetime: number | null;
  /** EUR je jaehrlich vermiedene Tonne (Predium-kompatibel, ohne Lebensdauer). */
  eurPerTonneAnnual: number | null;
  lifetimeYears: number;
}

/** CO2-Vermeidungskosten; 0-Einsparung -> null ("N/A", Spez. 2.8). */
export function avoidanceCost(
  netInvestEur: number | null,
  co2SavingTonnesPerYear: number | null,
  lifetimeYears: number,
): AvoidanceCostResult {
  const valid =
    netInvestEur != null &&
    co2SavingTonnesPerYear != null &&
    co2SavingTonnesPerYear > 1e-6;
  return {
    eurPerTonneLifetime:
      valid && lifetimeYears > 0
        ? netInvestEur / (co2SavingTonnesPerYear * lifetimeYears)
        : null,
    eurPerTonneAnnual: valid ? netInvestEur / co2SavingTonnesPerYear : null,
    lifetimeYears,
  };
}

/** Energiepreis eines Traegers im Jahr t: Basispreis x 1,02^(t-Basisjahr). */
export function escalatedPrice(
  basePriceEurPerKwh: number,
  year: number,
  baseYear = BASE_YEAR,
): number {
  return basePriceEurPerKwh * ENERGY_PRICE_ESCALATION ** (year - baseYear);
}

/** Jaehrliche Energiekosten eines Zustands im Jahr t (EUR/m2). */
function energyCostPerM2(state: EnergyState, year: number): number {
  let cost = 0;
  for (const s of state.perCarrier) {
    const base = carrierPriceEurPerKwh(s.carrier);
    cost += (s.heatKwhM2a + s.electricityKwhM2a) * escalatedPrice(base, year);
  }
  return cost;
}

/** Jaehrliche CO2-Abgabe eines Zustands im Jahr t (EUR/m2, EBeV-Welt). */
function levyPerM2(
  state: EnergyState,
  year: number,
  pricePath: Co2PricePath,
): number {
  let kg = 0;
  for (const s of state.perCarrier) {
    const f = ebevCo2KgPerKwh(s.carrier);
    if (f == null) continue;
    kg += (s.heatKwhM2a + s.electricityKwhM2a) * f;
  }
  return (kg / 1000) * co2PriceForYear(year, pricePath);
}

export interface DynamicPaybackResult {
  /** Amortisation in Jahren (erstes Jahr voller Deckung); null = nie/<= 0. */
  paybackYears: number | null;
  /** Einsparung im ersten Jahr (EUR/a). */
  firstYearSavingsEur: number | null;
  /** Bandbreiten-Variante mit Prebound-Korrektur (bedarfsbasiert). */
  paybackYearsPrebound: number | null;
  firstYearSavingsPreboundEur: number | null;
}

/**
 * Dynamische Amortisation (Spez. 2.8): kumulierte (Energie- + CO2-Kosten-)
 * Einsparungen mit Preisdynamik gegen die Netto-Investition.
 *
 * demandBased = true (Bedarfsausweis): zusaetzlich die Prebound-Variante
 * (Baseline x 0,7) fuer die Bandbreiten-Darstellung (Spez. 1.4a).
 */
export function dynamicPayback(
  baseState: EnergyState,
  scenState: EnergyState,
  netInvestEur: number | null,
  areaM2: number | null,
  opts: {
    demandBased?: boolean;
    pricePath?: Co2PricePath;
    maxYears?: number;
    startYear?: number;
  } = {},
): DynamicPaybackResult {
  const pricePath = opts.pricePath ?? "behg";
  const maxYears = opts.maxYears ?? 50;
  const startYear = opts.startYear ?? BASE_YEAR;

  if (netInvestEur == null || netInvestEur <= 0 || areaM2 == null || areaM2 <= 0)
    return {
      paybackYears: null,
      firstYearSavingsEur: null,
      paybackYearsPrebound: null,
      firstYearSavingsPreboundEur: null,
    };

  const savingsInYear = (year: number, preboundFactor: number): number => {
    const baseCost =
      (energyCostPerM2(baseState, year) + levyPerM2(baseState, year, pricePath)) *
      preboundFactor;
    const scenCost =
      energyCostPerM2(scenState, year) + levyPerM2(scenState, year, pricePath);
    // Prebound: die Baseline ueberzeichnet den Ist-Verbrauch; das Szenario
    // wird nicht zusaetzlich korrigiert (konservative Untergrenze).
    return (baseCost - scenCost) * areaM2;
  };

  const findPayback = (preboundFactor: number): number | null => {
    let cumulative = 0;
    for (let i = 0; i < maxYears; i++) {
      const saving = savingsInYear(startYear + i, preboundFactor);
      cumulative += saving;
      if (cumulative >= netInvestEur) return i + 1;
    }
    return null;
  };

  const firstYearSavings = savingsInYear(startYear, 1);
  const payback = firstYearSavings > 0 ? findPayback(1) : null;

  let paybackPrebound: number | null = null;
  let firstYearPrebound: number | null = null;
  if (opts.demandBased) {
    firstYearPrebound = savingsInYear(startYear, PREBOUND_FACTOR_LOW);
    paybackPrebound =
      firstYearPrebound > 0 ? findPayback(PREBOUND_FACTOR_LOW) : null;
  }

  return {
    paybackYears: payback,
    firstYearSavingsEur: firstYearSavings,
    paybackYearsPrebound: paybackPrebound,
    firstYearSavingsPreboundEur: firstYearPrebound,
  };
}
