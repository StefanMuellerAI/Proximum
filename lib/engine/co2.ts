import crremData from "@/lib/data/crrem-de.json";
import { CARRIERS } from "@/lib/data/reference";
import type { EnergyState, Co2Result } from "@/lib/engine/types";
import { BASE_YEAR, YEAR_START, YEAR_END } from "@/lib/engine/types";

const gridEf = crremData.gridEf as Record<string, number>;

/** Netz-Emissionsfaktor Strom (kg CO2/kWh) fuer ein Jahr, mit Clamping. */
export function gridEfForYear(year: number): number {
  const y = Math.min(YEAR_END, Math.max(YEAR_START, year));
  if (gridEf[String(y)] !== undefined) return gridEf[String(y)];
  // Fallback: naechstliegendes Jahr
  const years = Object.keys(gridEf).map(Number);
  const nearest = years.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
  return gridEf[String(nearest)];
}

/**
 * CO2-Intensitaet (kg CO2e/m²·a) fuer ein bestimmtes Jahr.
 * Fossile Traeger: konstanter Faktor. Strom-Traeger: zeitabhaengiger Netz-EF.
 */
export function co2IntensityForYear(state: EnergyState, year: number): number {
  let sum = 0;
  for (const share of state.perCarrier) {
    const carrier = CARRIERS[share.carrier];
    const energy = share.heatKwhM2a + share.electricityKwhM2a;
    if (carrier.isElectric) {
      sum += energy * gridEfForYear(year);
    } else {
      sum += energy * carrier.co2KgPerKwh;
    }
  }
  return sum;
}

/**
 * CO2-Kennzahl fuer das Basisjahr. Nutzt bevorzugt den Ausweiswert (THG),
 * sonst die aus den Energietraegern berechnete Intensitaet.
 */
export function computeCo2(
  state: EnergyState,
  areaM2: number | null,
  certificateThgKgM2a: number | null,
  useCertificate: boolean,
): Co2Result {
  const computed = co2IntensityForYear(state, BASE_YEAR);
  const fromCertificate = useCertificate && certificateThgKgM2a != null;
  const intensityKgM2a = fromCertificate ? certificateThgKgM2a! : computed;
  const tonnesPerYear =
    areaM2 != null ? (intensityKgM2a * areaM2) / 1000 : null;
  return { intensityKgM2a, tonnesPerYear, fromCertificate };
}
