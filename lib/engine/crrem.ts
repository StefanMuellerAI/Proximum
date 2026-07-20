import crremData from "@/lib/data/crrem-de.json";
import type { CrremType } from "@/lib/data/reference";
import type {
  EnergyState,
  CrremResult,
  CrremEnergyResult,
  YearPoint,
} from "@/lib/engine/types";
import { BASE_YEAR, YEAR_END } from "@/lib/engine/types";
import { co2IntensityForYear } from "@/lib/engine/co2";
import {
  climateFactors,
  heatNormalizationFactor,
  type ClimateFactors,
} from "@/lib/engine/climate";

const co2Paths = crremData.co2 as Record<string, Record<string, number>>;
const energyPaths = crremData.energy as Record<string, Record<string, number>>;

/** Verbindliche CRREM-Basis (Spez. 2.6): v2.05, 1,5 °C, All-GHG, RCP 4.5. */
export const CRREM_VERSION = "2.05";

function pathValue(
  paths: Record<string, Record<string, number>>,
  type: CrremType,
  year: number,
): number {
  const path = paths[type];
  if (!path) return NaN;
  if (path[String(year)] !== undefined) return path[String(year)];
  const years = Object.keys(path).map(Number);
  const nearest = years.reduce((a, b) =>
    Math.abs(b - year) < Math.abs(a - year) ? b : a,
  );
  return path[String(nearest)];
}

/** CRREM-CO2-Zielintensitaet (kg CO2e/m²·a) fuer Nutzungsart und Jahr. */
export function pathwayForYear(type: CrremType, year: number): number {
  return pathValue(co2Paths, type, year);
}

/** CRREM-Energiepfad (EUI-Ziel, kWh/m²·a) fuer Nutzungsart und Jahr. */
export function energyPathwayForYear(type: CrremType, year: number): number {
  return pathValue(energyPaths, type, year);
}

export interface CrremOptions {
  /**
   * Verbrauchsbasierte Analyse: Klimanormalisierung (HDD) wird auf den
   * Waermeanteil angewandt. Bedarfsbasiert (Default): keine Normalisierung,
   * Ausweiswerte gelten als Basisjahr-Messwerte (Spez. 2.6).
   */
  consumptionBased?: boolean;
  /** PLZ fuer die HDD/CDD-Klimafaktoren (Fallback: DE-Durchschnitt). */
  plz?: string | null;
  /**
   * Flaechenreferenz der Intensitaeten: NGF fuer verbrauchsbasierte,
   * EBF fuer bedarfsbasierte Analysen (nur deklarativ, Werte kommen bereits
   * flaechenbezogen aus dem Zustand).
   */
  areaReference?: "NGF" | "EBF";
}

/**
 * Vergleicht die (zeitabhaengige) Gebaeude-Intensitaet mit dem CRREM-CO2-Pfad
 * UND die Endenergie-Intensitaet mit dem CRREM-Energiepfad (EUI).
 * Stranding-/Misalignment-Jahr = erstes Jahr ueber dem jeweiligen Pfad.
 */
export function computeCrrem(
  state: EnergyState,
  crremType: CrremType,
  opts: CrremOptions = {},
): CrremResult {
  const consumptionBased = opts.consumptionBased ?? false;
  const factors: ClimateFactors | null = consumptionBased
    ? climateFactors(opts.plz)
    : null;

  const series: YearPoint[] = [];
  const energySeries: YearPoint[] = [];
  let strandingYear: number | null = null;
  let energyStrandingYear: number | null = null;

  const totalEnergy = state.heatKwhM2a + state.electricityKwhM2a;

  for (let year = BASE_YEAR; year <= YEAR_END; year++) {
    // Klimanormalisierung: nur der Waermeanteil folgt den HDD (Spez. 2.6);
    // Kuehlung steckt im Stromanteil und bleibt mangels Aufschluesselung
    // konservativ unnormalisiert.
    const nfHeat = factors ? heatNormalizationFactor(factors, year) : 1;

    const normalizedState: EnergyState = factors
      ? {
          heatKwhM2a: state.heatKwhM2a * nfHeat,
          electricityKwhM2a: state.electricityKwhM2a,
          perCarrier: state.perCarrier.map((s) => ({
            ...s,
            heatKwhM2a: s.heatKwhM2a * nfHeat,
          })),
        }
      : state;

    // Faktor-Hygiene (Spez. 2.5): CRREM-Stranding rechnet in der
    // CRREM-Faktorwelt (Basisjahr 2020, Netzpfade fuer Strom + Fernwaerme).
    const gebaeude = co2IntensityForYear(normalizedState, year, {
      database: "crrem",
    });
    const pfad = pathwayForYear(crremType, year);
    series.push({
      year,
      gebaeude: Number(gebaeude.toFixed(2)),
      pfad: Number(pfad.toFixed(2)),
    });
    if (strandingYear === null && gebaeude > pfad) strandingYear = year;

    const eui = state.heatKwhM2a * nfHeat + state.electricityKwhM2a;
    const energiePfad = energyPathwayForYear(crremType, year);
    energySeries.push({
      year,
      gebaeude: Number(eui.toFixed(2)),
      pfad: Number(energiePfad.toFixed(2)),
    });
    if (energyStrandingYear === null && eui > energiePfad)
      energyStrandingYear = year;
  }

  const base = series[0];
  const energyBase = energySeries[0];

  const energy: CrremEnergyResult = {
    series: energySeries,
    strandingYear: energyStrandingYear,
    strandedFromStart: energyStrandingYear === BASE_YEAR,
    euiBase: totalEnergy,
    pathwayBase: energyBase.pfad,
  };

  return {
    crremType,
    series,
    strandingYear,
    strandedFromStart: strandingYear === BASE_YEAR,
    co2IntensityBase: base.gebaeude,
    pathwayBase: base.pfad,
    energy,
    version: CRREM_VERSION,
    areaReference:
      opts.areaReference ?? (consumptionBased ? "NGF" : "EBF"),
    climateNormalized: consumptionBased,
  };
}
