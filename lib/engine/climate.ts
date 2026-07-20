/**
 * Klimanormalisierung nach CRREM (GAP-6, Spez. 2.6).
 *
 * NF(x) skaliert NUR Heizung (HDD) und Kuehlung (CDD) - Proximum kennt im
 * Zustand Heiz- und Strom-Toepfe; der HDD-Faktor wird auf den Waermeanteil
 * angewandt, der CDD-Faktor auf einen expliziten Kuehl-Anteil (falls
 * bekannt). Datenbasis: CRREM v2.05 HDD/CDD-Projektionen (RCP 4.5) je
 * 3-stelligem PLZ-Praefix (lib/data/crrem-climate-de.json).
 *
 * Anwendung nur fuer verbrauchsbasierte Analysen; bedarfsbasierte Werte
 * werden als Basisjahr-Messwerte OHNE Normalisierung behandelt (Spez. 2.6).
 */
import climateData from "@/lib/data/crrem-climate-de.json";

export interface ClimateFactors {
  /** Heizgradtage im Basisjahr (2024). */
  hdd: number;
  /** Jaehrliche HDD-Aenderung (RCP 4.5). */
  hddPa: number;
  cdd: number;
  cddPa: number;
}

const BY_PREFIX = climateData.byPrefix as Record<string, ClimateFactors>;
const DE_AVERAGE = climateData.deAverage as ClimateFactors;
export const CLIMATE_BASE_YEAR = 2024;

/** Fuenfstellige PLZ aus einer Adresse extrahieren. */
export function plzFromAddress(address: string | null | undefined): string | null {
  const m = (address ?? "").match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

/** Klimafaktoren fuer eine PLZ (Fallback: DE-Durchschnitt). */
export function climateFactors(plz: string | null | undefined): ClimateFactors {
  if (plz && plz.length >= 3) {
    const entry = BY_PREFIX[plz.slice(0, 3)];
    if (entry) return entry;
  }
  return DE_AVERAGE;
}

/**
 * HDD-Normalisierungsfaktor NF_heat(x) = HDD(x) / HDD(Basisjahr).
 * HDD(x) linear projiziert; nie unter 0 (physikalische Untergrenze).
 */
export function heatNormalizationFactor(
  factors: ClimateFactors,
  year: number,
): number {
  if (factors.hdd <= 0) return 1;
  const projected = Math.max(0, factors.hdd + factors.hddPa * (year - CLIMATE_BASE_YEAR));
  return projected / factors.hdd;
}

/** CDD-Normalisierungsfaktor NF_cool(x) = CDD(x) / CDD(Basisjahr). */
export function coolNormalizationFactor(
  factors: ClimateFactors,
  year: number,
): number {
  if (factors.cdd <= 0) return 1;
  const projected = Math.max(0, factors.cdd + factors.cddPa * (year - CLIMATE_BASE_YEAR));
  return projected / factors.cdd;
}
