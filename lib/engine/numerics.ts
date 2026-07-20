/**
 * Numerik-Grundbausteine nach NUMERICS.md (verbindliche Konvention).
 *
 * - classifyByBands: Klassifizierung mit datengetriebener
 *   Grenzwert-Inklusivitaet (lte = "<=", lt = "<").
 * - roundTo / roundCo2KostAufG: explizite Rundung (nur Darstellung bzw.
 *   gesetzlich vorgeschriebene Fachrundung).
 * - interpolateSeries: lineare Interpolation von Jahres-Zeitreihen mit
 *   konstanter Randfortschreibung.
 */

/** Grenzwert-Inklusivitaet eines Klassensystems (Datenfeld, nie Code-Konvention). */
export type BoundaryMode = "lte" | "lt";

export interface ClassBand<TLabel extends string = string> {
  label: TLabel;
  /** Obergrenze der Klasse; die letzte Klasse hat keine Obergrenze (null). */
  max: number | null;
}

/**
 * Ordnet einen Wert einer Klasse zu. Die Baender muessen aufsteigend nach
 * max sortiert sein; das letzte Band (max = null) faengt alle Restwerte.
 *
 * boundary = "lte": Wert == max gehoert noch zur Klasse (GEG: A+ <= 30).
 * boundary = "lt":  Wert == max gehoert bereits zur naechsten Klasse (OIB: A < 25).
 */
export function classifyByBands<TLabel extends string>(
  value: number,
  bands: readonly ClassBand<TLabel>[],
  boundary: BoundaryMode,
): TLabel {
  for (const band of bands) {
    if (band.max === null) return band.label;
    if (boundary === "lte" ? value <= band.max : value < band.max)
      return band.label;
  }
  // Defensive: Baender ohne Rest-Band sind ein Datenfehler.
  return bands[bands.length - 1].label;
}

/** Kaufmaennische Rundung auf n Nachkommastellen (nur Darstellung/Export). */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // EPSILON-Korrektur gegen Binaerdarstellungs-Artefakte (z. B. 1.005).
  return Math.round((value + Number.EPSILON) * f) / f;
}

/**
 * CO2KostAufG § 5 Abs. 1: CO2-Ausstoss pro m² Wohnflaeche wird auf EINE
 * Nachkommastelle gerundet, bevor die Stufe bestimmt wird (Fachrundung).
 */
export function roundCo2KostAufG(kgCo2PerM2a: number): number {
  return roundTo(kgCo2PerM2a, 1);
}

/**
 * Linear interpolierte Jahres-Zeitreihe. Ausserhalb des Definitionsbereichs
 * gilt der jeweilige Randwert (konstante Fortschreibung, keine Extrapolation).
 */
export function interpolateSeries(
  series: Record<number, number> | Map<number, number>,
  year: number,
): number {
  const entries =
    series instanceof Map
      ? [...series.entries()]
      : Object.entries(series).map(([y, v]) => [Number(y), v] as [number, number]);
  if (entries.length === 0) return NaN;
  entries.sort((a, b) => a[0] - b[0]);

  const exact = entries.find(([y]) => y === year);
  if (exact) return exact[1];

  const first = entries[0];
  const last = entries[entries.length - 1];
  if (year <= first[0]) return first[1];
  if (year >= last[0]) return last[1];

  let i = 0;
  while (entries[i + 1][0] < year) i++;
  const [y0, v0] = entries[i];
  const [y1, v1] = entries[i + 1];
  const t = (year - y0) / (y1 - y0);
  return v0 + t * (v1 - v0);
}
