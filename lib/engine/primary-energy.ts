/**
 * Primaerenergie-Naeherung aus GEG-PE-Faktoren: dient der Skalierung des
 * Ausweis-PE-Werts nach Sanierung (Fraunhofer-Klasse, Taxonomie-Ziel).
 */
import { PRIMARY_ENERGY_FACTORS } from "@/lib/data/reference";
import type { EnergyState } from "@/lib/engine/types";

/** Primaerenergie eines Energiezustands aus GEG-PE-Faktoren (kWh/m2a). */
export function primaryEnergyOf(state: EnergyState): number {
  let pe = 0;
  for (const s of state.perCarrier) {
    pe +=
      (s.heatKwhM2a + s.electricityKwhM2a) * PRIMARY_ENERGY_FACTORS[s.carrier];
  }
  return pe;
}

/**
 * Schaetzt den Primaerenergiewert nach Sanierung: der Ausweiswert wird mit dem
 * Verhaeltnis der (aus PE-Faktoren berechneten) Primaerenergie skaliert.
 * Ohne Ausweiswert wird direkt der berechnete Wert genutzt.
 */
export function estimatePrimaryAfter(
  certificatePrimaryKwhM2a: number | null,
  baseState: EnergyState,
  scenState: EnergyState,
): number | null {
  const peBase = primaryEnergyOf(baseState);
  const peScen = primaryEnergyOf(scenState);
  if (certificatePrimaryKwhM2a != null && peBase > 0)
    return certificatePrimaryKwhM2a * (peScen / peBase);
  if (peScen > 0 || peBase > 0) return peScen;
  return null;
}
