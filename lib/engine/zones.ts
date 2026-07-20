/**
 * Zonenmodell fuer Mischnutzung (2.13-14 / Begleitdokument A5):
 * Ein Gebaeude wird in Nutzungszonen mit Flaechenanteilen zerlegt; jede
 * Zone traegt ihre CRREM-Nutzungsart und (optional) eigene Energiekennwerte.
 *
 * Fuer Mischgebaeude gilt weiterhin: KEINE Effizienzklasse (Predium-
 * Verhalten, Spez. 2.2) - aber CRREM-Stranding und CO2e werden zonenweise
 * gegen die jeweils richtigen Pfade gerechnet und flaechengewichtet.
 */
import type { CrremType } from "@/lib/data/reference";
import { pathwayForYear, energyPathwayForYear } from "@/lib/engine/crrem";
import { BASE_YEAR, YEAR_END } from "@/lib/engine/types";

export interface UsageZone {
  crremType: CrremType;
  /** Flaechenanteil 0..1 (Summe aller Zonen = 1). */
  areaShare: number;
  /** Eigene CO2-Intensitaet der Zone (kg/m2a); null = Gebaeudewert. */
  co2IntensityKgM2a?: number | null;
  /** Eigene Endenergie der Zone (kWh/m2a); null = Gebaeudewert. */
  euiKwhM2a?: number | null;
}

export interface ZonedCrremResult {
  /** Flaechengewichteter Misch-Zielpfad je Jahr. */
  series: { year: number; pfad: number; energiePfad: number }[];
  /** Stranding gegen den Misch-Pfad (CO2). */
  strandingYear: number | null;
  /** Stranding gegen den Misch-Energiepfad (EUI). */
  energyStrandingYear: number | null;
}

/** Normalisiert Zonen-Anteile auf Summe 1 (Toleranz gegen Eingabefehler). */
export function normalizeZones(zones: UsageZone[]): UsageZone[] {
  const total = zones.reduce((s, z) => s + Math.max(0, z.areaShare), 0);
  if (total <= 0) return zones;
  return zones.map((z) => ({ ...z, areaShare: Math.max(0, z.areaShare) / total }));
}

/**
 * CRREM fuer Mischnutzung: der Zielpfad ist der flaechengewichtete
 * Mittelwert der Zonen-Pfade (CRREM-Konvention fuer Mixed-Use);
 * die Gebaeude-Intensitaet wird je Zone (eigener Wert oder Gebaeudewert)
 * gewichtet.
 */
export function computeZonedCrrem(
  zones: UsageZone[],
  buildingCo2KgM2a: number,
  buildingEuiKwhM2a: number,
): ZonedCrremResult {
  const normalized = normalizeZones(zones);
  const series: ZonedCrremResult["series"] = [];
  let strandingYear: number | null = null;
  let energyStrandingYear: number | null = null;

  const weightedCo2 = normalized.reduce(
    (s, z) => s + (z.co2IntensityKgM2a ?? buildingCo2KgM2a) * z.areaShare,
    0,
  );
  const weightedEui = normalized.reduce(
    (s, z) => s + (z.euiKwhM2a ?? buildingEuiKwhM2a) * z.areaShare,
    0,
  );

  for (let year = BASE_YEAR; year <= YEAR_END; year++) {
    const pfad = normalized.reduce(
      (s, z) => s + pathwayForYear(z.crremType, year) * z.areaShare,
      0,
    );
    const energiePfad = normalized.reduce(
      (s, z) => s + energyPathwayForYear(z.crremType, year) * z.areaShare,
      0,
    );
    series.push({ year, pfad, energiePfad });
    if (strandingYear === null && weightedCo2 > pfad) strandingYear = year;
    if (energyStrandingYear === null && weightedEui > energiePfad)
      energyStrandingYear = year;
  }

  return { series, strandingYear, energyStrandingYear };
}
