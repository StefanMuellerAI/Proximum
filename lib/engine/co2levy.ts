import { CARRIERS, co2PriceForYear } from "@/lib/data/reference";
import type { EnergyState, Co2LevyResult } from "@/lib/engine/types";
import { BASE_YEAR, YEAR_END } from "@/lib/engine/types";

/**
 * CO2-Abgabe: nur BEHG-relevante (fossile) Energietraeger werden bepreist.
 * Fossiler CO2-Ausstoss (t/a) × CO2-Preis-Pfad (EUR/t) -> Kostenprojektion.
 */
export function computeCo2Levy(
  state: EnergyState,
  areaM2: number | null,
): Co2LevyResult {
  // Fossile CO2-Intensitaet (kg/m²·a) der BEHG-relevanten Traeger
  let fossilKgM2a = 0;
  for (const share of state.perCarrier) {
    const carrier = CARRIERS[share.carrier];
    if (!carrier.behgRelevant) continue;
    const energy = share.heatKwhM2a + share.electricityKwhM2a;
    fossilKgM2a += energy * carrier.co2KgPerKwh;
  }

  const fossilTonnesPerYear =
    areaM2 != null ? (fossilKgM2a * areaM2) / 1000 : null;

  const series: Co2LevyResult["series"] = [];
  for (let year = BASE_YEAR; year <= YEAR_END; year++) {
    const price = co2PriceForYear(year);
    series.push({
      year,
      priceEurPerT: price,
      eurPerYear:
        fossilTonnesPerYear != null ? fossilTonnesPerYear * price : null,
    });
  }

  return {
    fossilTonnesPerYear,
    eurPerYearBase: series[0]?.eurPerYear ?? null,
    series,
  };
}
