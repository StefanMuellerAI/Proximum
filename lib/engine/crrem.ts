import crremData from "@/lib/data/crrem-de.json";
import type { CrremType } from "@/lib/data/reference";
import type { EnergyState, CrremResult, YearPoint } from "@/lib/engine/types";
import { BASE_YEAR, YEAR_END } from "@/lib/engine/types";
import { co2IntensityForYear } from "@/lib/engine/co2";

const co2Paths = crremData.co2 as Record<string, Record<string, number>>;

/** CRREM-Zielintensitaet (kg CO2e/m²·a) fuer Nutzungsart und Jahr. */
export function pathwayForYear(type: CrremType, year: number): number {
  const path = co2Paths[type];
  if (!path) return NaN;
  if (path[String(year)] !== undefined) return path[String(year)];
  const years = Object.keys(path).map(Number);
  const nearest = years.reduce((a, b) => (Math.abs(b - year) < Math.abs(a - year) ? b : a));
  return path[String(nearest)];
}

/**
 * Vergleicht die (zeitabhaengige) Gebaeude-Intensitaet mit dem CRREM-Pfad und
 * bestimmt das Stranding-Jahr = erstes Jahr, in dem das Gebaeude den Pfad
 * ueberschreitet.
 */
export function computeCrrem(
  state: EnergyState,
  crremType: CrremType,
): CrremResult {
  const series: YearPoint[] = [];
  let strandingYear: number | null = null;

  for (let year = BASE_YEAR; year <= YEAR_END; year++) {
    const gebaeude = co2IntensityForYear(state, year);
    const pfad = pathwayForYear(crremType, year);
    series.push({
      year,
      gebaeude: Number(gebaeude.toFixed(2)),
      pfad: Number(pfad.toFixed(2)),
    });
    if (strandingYear === null && gebaeude > pfad) strandingYear = year;
  }

  const base = series[0];
  return {
    crremType,
    series,
    strandingYear,
    strandedFromStart: strandingYear === BASE_YEAR,
    co2IntensityBase: base.gebaeude,
    pathwayBase: base.pfad,
  };
}
