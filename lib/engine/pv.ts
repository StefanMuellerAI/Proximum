/**
 * Photovoltaik nach DIN V 18599-9 (GAP-9, Spez. 2.7) - Monatsbilanz:
 *
 *   Q_f,prod,PV,monatlich = (E_sol x P_pk,m x f_pref) / I_ref     I_ref = 1 kW/m2
 *   E_sol = I_sol x d_mth x 24 / 1000   [kWh/m2 im Monat]
 *   P_pk  = (K_pk x A) x 0,9            (falls keine Herstellerangabe)
 *
 * Solare Einstrahlung: Monatswerte Standort Potsdam (DIN V 18599-10
 * Anhang E). Flachdach ohne Angabe -> Sued. Verteilung: gleichmaessig auf
 * alle Strom-Verbraucher, Annahme 100 % Eigenverbrauch, CO2-Intensitaet
 * nie negativ (PV reduziert Verbrauch nur bis 0).
 *
 * Bestandsanlage: Pflichteingabe nur Jahresertrag [kWh/a].
 * Verbrauchsausweis-Sonderlogik: der Ausweis-Strom ist bereits
 * PV-gemindert -> beim PV-Anlegen keine doppelte Anrechnung
 * (pvAlreadyInCertificate-Flag).
 */

/** Modulleistung K_pk (Wp/m2) je Modultyp (Spez. 2.7). */
export const MODULE_WP_PER_M2 = {
  mono: 154,
  poly: 143,
  hocheffizienz: 200,
  cis: 125,
} as const;

export type ModuleType = keyof typeof MODULE_WP_PER_M2;

/** Systemfaktor 0,9 auf die Peakleistung (ohne Herstellerangabe). */
export const PEAK_POWER_FACTOR = 0.9;

/** Performance-Faktor f_pref (Aufdach, DIN-Naeherung). */
export const PERFORMANCE_FACTOR = 0.75;

/**
 * Mittlere solare Einstrahlung I_sol (W/m2) je Monat, Standort Potsdam,
 * Sued-Orientierung ~35 Grad Neigung (DIN V 18599-10 Anhang E,
 * dokumentierte Naeherung).
 */
export const POTSDAM_IRRADIANCE_W_M2: number[] = [
  35, 62, 105, 155, 190, 200, 195, 170, 125, 75, 40, 28,
];

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Orientierungsfaktoren relativ zu Sued (Flachdach ohne Angabe -> Sued). */
export const ORIENTATION_FACTORS = {
  sued: 1.0,
  suedost: 0.95,
  suedwest: 0.95,
  ost: 0.85,
  west: 0.85,
  nord: 0.6,
  flachdach: 1.0, // Default Sued (Spez. 2.7)
} as const;

export type Orientation = keyof typeof ORIENTATION_FACTORS;

export interface PvSystem {
  /** Modulflaeche (m2). */
  areaM2: number;
  moduleType: ModuleType;
  orientation?: Orientation;
  /** Herstellerangabe Peakleistung (kWp); sonst K_pk x A x 0,9. */
  peakPowerKwp?: number;
}

/** Peakleistung P_pk (kWp) nach Spez. 2.7. */
export function peakPowerKwp(system: PvSystem): number {
  if (system.peakPowerKwp != null) return system.peakPowerKwp;
  return (MODULE_WP_PER_M2[system.moduleType] * system.areaM2 * PEAK_POWER_FACTOR) / 1000;
}

export interface PvMonthlyResult {
  monthlyKwh: number[];
  annualKwh: number;
}

/** Monatsbilanz der PV-Produktion (kWh je Monat + Jahressumme). */
export function pvMonthlyYield(system: PvSystem): PvMonthlyResult {
  const pPk = peakPowerKwp(system); // kW
  const orientation = ORIENTATION_FACTORS[system.orientation ?? "flachdach"];
  const monthlyKwh = POTSDAM_IRRADIANCE_W_M2.map((iSol, m) => {
    // E_sol = I_sol x d x 24 / 1000 [kWh/m2] bei I_ref = 1 kW/m2
    const eSol = (iSol * DAYS_PER_MONTH[m] * 24) / 1000;
    return eSol * pPk * PERFORMANCE_FACTOR * orientation;
  });
  return {
    monthlyKwh,
    annualKwh: monthlyKwh.reduce((s, v) => s + v, 0),
  };
}

/**
 * PV-Ertrag je m2 Bezugsflaeche (kWh/m2a) fuer die Massnahmen-Simulation:
 * belegt 80 % der Dachflaeche mit Mono-Modulen (DIN-Monatsbilanz).
 * Ersetzt den Pauschalertrag; Google-Solar-Daten (PLUS-2) bleiben als
 * praezisere Quelle fuer Dachflaeche/Ertrag vorrangig.
 */
export function dinPvYieldPerM2Ref(
  roofAreaM2: number,
  refAreaM2: number,
  moduleType: ModuleType = "mono",
): number {
  if (refAreaM2 <= 0 || roofAreaM2 <= 0) return 0;
  const { annualKwh } = pvMonthlyYield({
    areaM2: roofAreaM2 * 0.8,
    moduleType,
    orientation: "flachdach",
  });
  return annualKwh / refAreaM2;
}

/**
 * Effektiver PV-Ertrag eines Gebaeudes fuer die Simulation:
 * - Solar-API/manuell (pvSource != typologie): Gebaeudewert unveraendert
 * - Typologie-Default: DIN-Monatsbilanz auf Basis der Dachflaechen-Heuristik
 *   (EBF / Geschosse) statt des alten Pauschalwerts
 */
export function effectivePvYieldKwhPerM2(building: {
  pvYieldKwhPerM2: number;
  pvSource: string;
  bezugsflaecheM2: number | null;
  gebaeudetyp: "Wohngebäude" | "Nichtwohngebäude";
}): number {
  if (building.pvSource !== "typologie" || building.bezugsflaecheM2 == null)
    return building.pvYieldKwhPerM2;
  const storeys = building.gebaeudetyp === "Wohngebäude" ? 3 : 2;
  const roofM2 = building.bezugsflaecheM2 / storeys;
  const din = dinPvYieldPerM2Ref(roofM2, building.bezugsflaecheM2);
  return din > 0 ? din : building.pvYieldKwhPerM2;
}

/**
 * Bestandsanlage: nur der Jahresertrag ist Pflicht; Verteilung gleichmaessig
 * auf die Strom-Verbraucher, 100 % Eigenverbrauch, nie negativ.
 * pvAlreadyInCertificate = true (Verbrauchsausweis-Sonderlogik): der
 * Ausweis-Strom ist bereits PV-gemindert -> Ertrag NICHT erneut abziehen.
 */
export function existingPvOffsetKwhPerM2(
  annualYieldKwh: number,
  refAreaM2: number | null,
  pvAlreadyInCertificate: boolean,
): number {
  if (pvAlreadyInCertificate || refAreaM2 == null || refAreaM2 <= 0) return 0;
  return annualYieldKwh / refAreaM2;
}
