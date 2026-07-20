import {
  CARRIERS,
  carrierPriceEurPerKwh,
  type CarrierKey,
} from "@/lib/data/reference";
import type { EnergyState, CostResult } from "@/lib/engine/types";

/**
 * Jaehrliche Energiekosten = Σ (Endenergie je Traeger [kWh/m²·a] × Preis × Flaeche).
 * Ohne Flaeche werden nur spezifische Kosten (EUR/m²·a) berechnet.
 * Preise: optionale Preistabelle (Assumption-Set, 2.13-4) vor regionaler
 * Verfeinerung (REGIONAL_ENERGY_PRICES) vor Bundesdurchschnitt.
 */
export function computeCost(
  state: EnergyState,
  areaM2: number | null,
  prices?: Partial<Record<CarrierKey, number>>,
): CostResult {
  let eurPerM2Year = 0;
  const breakdown: { label: string; eurPerYear: number | null }[] = [];

  for (const share of state.perCarrier) {
    const carrier = CARRIERS[share.carrier];
    const energy = share.heatKwhM2a + share.electricityKwhM2a;
    const specific =
      energy * (prices?.[share.carrier] ?? carrierPriceEurPerKwh(share.carrier));
    eurPerM2Year += specific;
    breakdown.push({
      label: carrier.label,
      eurPerYear: areaM2 != null ? specific * areaM2 : null,
    });
  }

  return {
    eurPerYear: areaM2 != null ? eurPerM2Year * areaM2 : null,
    eurPerM2Year,
    breakdown,
  };
}
