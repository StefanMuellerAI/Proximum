import {
  ebevCo2KgPerKwh,
  co2PriceForYear,
  type Co2PricePath,
} from "@/lib/data/reference";
import type { EnergyState, Co2LevyResult } from "@/lib/engine/types";
import { BASE_YEAR, YEAR_END } from "@/lib/engine/types";

/**
 * CO2-Abgabe (Spez. 2.4): nur BEHG-relevante (fossile) Energietraeger inkl.
 * fossiler Fernwaerme, KEIN Aufschlag auf Strom.
 *
 * Faktor-Hygiene (Spez. 2.5): Diese Rechnung nutzt ausschliesslich
 * EBeV-Faktoren (ohne Vorkette) - NICHT die GEG-/CRREM-Faktoren.
 *
 * Preispfad: Default BEHG (2026: 65 EUR/t, ab 2027 +6,50 EUR/t je Jahr,
 * Predium-Paritaet); "ets2_szenario" als waehlbares Szenario.
 */
export function computeCo2Levy(
  state: EnergyState,
  areaM2: number | null,
  pricePath: Co2PricePath = "behg",
): Co2LevyResult {
  // Fossile CO2-Intensitaet (kg/m²·a) nach EBeV (ohne Vorkette)
  let fossilKgM2a = 0;
  for (const share of state.perCarrier) {
    const factor = ebevCo2KgPerKwh(share.carrier);
    if (factor == null) continue;
    const energy = share.heatKwhM2a + share.electricityKwhM2a;
    fossilKgM2a += energy * factor;
  }

  const fossilTonnesPerYear =
    areaM2 != null ? (fossilKgM2a * areaM2) / 1000 : null;

  const series: Co2LevyResult["series"] = [];
  for (let year = BASE_YEAR; year <= YEAR_END; year++) {
    const price = co2PriceForYear(year, pricePath);
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
