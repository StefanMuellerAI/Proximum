import {
  RENOVATION_MEASURES,
  CARRIERS,
  type RenovationMeasure,
  type EnvelopeComponent,
} from "@/lib/data/reference";
import type { CarrierShare } from "@/lib/schema";
import type { EnergyState } from "@/lib/engine/types";
import { envelopeHeatReduction, daylightFactor } from "@/lib/engine/envelope";

export interface InvestmentSummary {
  measureIds: string[];
  totalInvestEur: number | null;
  totalSubsidyEur: number | null;
  netInvestEur: number | null;
  investPerM2: number;
  netPerM2: number;
}

function cloneShares(shares: CarrierShare[]): CarrierShare[] {
  return shares.map((s) => ({ ...s }));
}

export function getMeasures(ids: string[]): RenovationMeasure[] {
  return RENOVATION_MEASURES.filter((m) => ids.includes(m.id));
}

/**
 * Wendet die gewaehlten Massnahmen auf den Energiezustand an.
 * Reihenfolge: 1) Huelle/Effizienz (Reduktionen), 2) Waermeerzeuger-Wechsel,
 * 3) PV (reduziert Netzstrom zuletzt).
 *
 * wwrPercent (optional): steuert die WWR-abhaengige Wirkung der Huellen-Massnahmen.
 * Ohne WWR wird der pauschale heatReductionPct-Fallback verwendet.
 *
 * envelopeReductions (optional, GAP-2): bauteilscharfe Waermeminderungen aus
 * dem KALIBRIERTEN thermischen Modell (lib/engine/thermal). Wenn gesetzt,
 * hat der Bottom-up-Wert Vorrang vor der WWR-Heuristik (Feature-Flag je
 * Gebaeude: nur bei erfolgreicher Skalierung).
 */
export function applyMeasures(
  base: EnergyState,
  ids: string[],
  wwrPercent?: number,
  pvYieldKwhPerM2?: number,
  envelopeReductions?: Partial<Record<EnvelopeComponent, number>> | null,
): EnergyState {
  const measures = getMeasures(ids);
  let shares = cloneShares(base.perCarrier);

  // 1) Reduktionen auf Waerme bzw. Strom (kumulativ multiplikativ)
  let heatFactor = 1;
  let elecFactor = 1;
  const dayFactor = wwrPercent != null ? daylightFactor(wwrPercent) : 1;
  for (const m of measures) {
    const thermal = m.envelopeComponent
      ? envelopeReductions?.[m.envelopeComponent]
      : undefined;
    if (thermal != null) {
      // Bauteilscharfe Minderung aus dem kalibrierten thermischen Modell
      heatFactor *= 1 - thermal;
    } else if (m.envelopeComponent && wwrPercent != null) {
      // WWR-abhaengige Waermeminderung aus dem Transmissionsmodell
      heatFactor *= 1 - envelopeHeatReduction(m.envelopeComponent, wwrPercent);
    } else if (m.heatReductionPct) {
      heatFactor *= 1 - m.heatReductionPct;
    }
    if (m.electricityReductionPct)
      elecFactor *= 1 - m.electricityReductionPct * dayFactor;
  }
  shares = shares.map((s) => ({
    ...s,
    heatKwhM2a: s.heatKwhM2a * heatFactor,
    electricityKwhM2a: s.electricityKwhM2a * elecFactor,
  }));

  // 2) Waermeerzeuger-Wechsel (z. B. Gas -> Waermepumpe)
  const switchMeasure = measures.find((m) => m.switchHeatCarrierTo);
  if (switchMeasure?.switchHeatCarrierTo) {
    const factor = switchMeasure.heatEndenergieFactor ?? 1;
    const totalHeat = shares.reduce((sum, s) => sum + s.heatKwhM2a, 0);
    // Waerme aus allen bisherigen Traegern entfernen
    shares = shares.map((s) => ({ ...s, heatKwhM2a: 0 }));
    const newKey = switchMeasure.switchHeatCarrierTo;
    const newCarrier = CARRIERS[newKey];
    const newHeatEnergy = totalHeat * factor;
    // Waermepumpe/elektrisch: Energie liegt als Strom vor
    const existing = shares.find((s) => s.carrier === newKey);
    const bucket = newCarrier.isElectric ? "electricityKwhM2a" : "heatKwhM2a";
    if (existing) {
      existing[bucket] += newHeatEnergy;
    } else {
      shares.push({
        carrier: newKey,
        label: newCarrier.label,
        heatKwhM2a: newCarrier.isElectric ? 0 : newHeatEnergy,
        electricityKwhM2a: newCarrier.isElectric ? newHeatEnergy : 0,
      });
    }
  }

  // 3) PV reduziert Netzstrom (kWh/m²·a). Gebaeude-Wert (aus Luftbild) hat
  //    Vorrang vor dem Massnahmen-Default.
  let pvYield = 0;
  for (const m of measures)
    if (m.pvYieldKwhPerM2) pvYield += pvYieldKwhPerM2 ?? m.pvYieldKwhPerM2;
  if (pvYield > 0) {
    // Zuerst vom Netzstrom abziehen, dann von uebrigem elektrischen Verbrauch
    const order = [...shares].sort((a, b) => {
      const ael = CARRIERS[a.carrier].isElectric ? 0 : 1;
      const bel = CARRIERS[b.carrier].isElectric ? 0 : 1;
      const anet = a.carrier === "strom_netz" ? 0 : 1;
      const bnet = b.carrier === "strom_netz" ? 0 : 1;
      return anet - bnet || ael - bel;
    });
    let remaining = pvYield;
    for (const s of order) {
      if (remaining <= 0) break;
      if (!CARRIERS[s.carrier].isElectric) continue;
      const reduce = Math.min(s.electricityKwhM2a, remaining);
      s.electricityKwhM2a -= reduce;
      remaining -= reduce;
    }
  }

  // Aufraeumen: leere Shares entfernen
  shares = shares.filter((s) => s.heatKwhM2a + s.electricityKwhM2a > 0.001);

  const heatKwhM2a = shares.reduce((sum, s) => sum + s.heatKwhM2a, 0);
  const electricityKwhM2a = shares.reduce(
    (sum, s) => sum + s.electricityKwhM2a,
    0,
  );

  return { heatKwhM2a, electricityKwhM2a, perCarrier: shares };
}

/** Investitions- und Foerdersumme der gewaehlten Massnahmen. */
export function summarizeInvestment(
  ids: string[],
  areaM2: number | null,
): InvestmentSummary {
  const measures = getMeasures(ids);
  let investPerM2 = 0;
  let subsidyPerM2 = 0;
  for (const m of measures) {
    investPerM2 += m.costPerM2;
    subsidyPerM2 += m.costPerM2 * m.subsidyRate;
  }
  const netPerM2 = investPerM2 - subsidyPerM2;
  return {
    measureIds: ids,
    totalInvestEur: areaM2 != null ? investPerM2 * areaM2 : null,
    totalSubsidyEur: areaM2 != null ? subsidyPerM2 * areaM2 : null,
    netInvestEur: areaM2 != null ? netPerM2 * areaM2 : null,
    investPerM2,
    netPerM2,
  };
}
