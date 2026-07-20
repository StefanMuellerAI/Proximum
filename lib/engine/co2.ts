import crremData from "@/lib/data/crrem-de.json";
import { CARRIERS, carrierCo2KgPerKwh } from "@/lib/data/reference";
import {
  CRREM_EF_2020,
  CRREM_GRID_CARRIERS,
  CRREM_HEAT_NETWORK_CARRIERS,
  GEG_ANLAGE9_EF,
  type SupplierEfSeries,
} from "@/lib/data/emission-factors";
import { interpolateSeries } from "@/lib/engine/numerics";
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

/** EF-Datenbank-Auswahl (GAP-8, Spez. 2.5). */
export interface EfOptions {
  /**
   * crrem: CRREM-Faktoren (Basisjahr 2020), Netzpfade fuer Strom UND
   *        netzgebundene Waerme; fossile Direktverbrennung konstant.
   * geg:   GEG Anlage 9 (mit Vorkette), zeitkonstant.
   * undefined: bisheriges Hybrid-Verhalten (statisch + Strom-Netzpfad).
   */
  database?: "crrem" | "geg";
  /** Lieferanten-EF-Zeitreihen (energy_suppliers); Vorrang vor Datenbank. */
  supplierEf?: SupplierEfSeries;
}

/**
 * CO2-Intensitaet (kg CO2e/m²·a) fuer ein bestimmtes Jahr.
 * Regel 1 (Spez. 2.5): fossile Direktverbrennung konstant, nur
 * netzgebundene Traeger (Strom, Fernwaerme) sinken ueber die Zeit.
 */
export function co2IntensityForYear(
  state: EnergyState,
  year: number,
  opts: EfOptions = {},
): number {
  const gridRatio = gridEfForYear(year) / gridEfForYear(2020);
  let sum = 0;
  for (const share of state.perCarrier) {
    const carrier = CARRIERS[share.carrier];
    const energy = share.heatKwhM2a + share.electricityKwhM2a;

    // Lieferanten-Override (Regel 3): eigene Zeitreihe hat Vorrang.
    const supplierSeries = opts.supplierEf?.[share.carrier];
    if (supplierSeries) {
      sum += energy * interpolateSeries(supplierSeries, year);
      continue;
    }

    if (opts.database === "crrem") {
      if (CRREM_GRID_CARRIERS.includes(share.carrier)) {
        sum += energy * gridEfForYear(year);
      } else if (CRREM_HEAT_NETWORK_CARRIERS.includes(share.carrier)) {
        // Netzgebundene Waerme skaliert proportional zum Strompfad
        sum += energy * (CRREM_EF_2020[share.carrier] ?? 0.297) * gridRatio;
      } else {
        sum += energy * (CRREM_EF_2020[share.carrier] ?? 0);
      }
    } else if (opts.database === "geg") {
      sum += energy * (GEG_ANLAGE9_EF[share.carrier] ?? 0);
    } else {
      // Legacy-Hybrid: statischer Faktor, Strom ueber CRREM-Netzpfad
      if (carrier.isElectric) {
        sum += energy * gridEfForYear(year);
      } else {
        sum += energy * carrierCo2KgPerKwh(share.carrier);
      }
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
  opts: EfOptions = {},
): Co2Result {
  const computed = co2IntensityForYear(state, BASE_YEAR, opts);
  const fromCertificate = useCertificate && certificateThgKgM2a != null;
  const intensityKgM2a = fromCertificate ? certificateThgKgM2a! : computed;
  const tonnesPerYear =
    areaM2 != null ? (intensityKgM2a * areaM2) / 1000 : null;
  return { intensityKgM2a, tonnesPerYear, fromCertificate };
}
