/**
 * Ueberhitzungsindikator: koppelt den Fenster-zu-Wand-Anteil (WWR) mit dem
 * standortbezogenen Hitze-Klimarisiko. Hoher WWR (v. a. ohne Verschattung) +
 * steigende Hitzebelastung -> hoeheres Ueberhitzungs-/Kuehlrisiko.
 *
 * Bewusst einfache, dokumentierte Heuristik.
 */
export type OverheatingLevel = "gering" | "mittel" | "hoch";

export interface OverheatingResult {
  level: OverheatingLevel;
  score: number;
  note: string;
}

/**
 * @param wwrPercent    Fenster-zu-Wand-Anteil in Prozent (0..100)
 * @param hitzeFuture   zukuenftiger Hitze-Gefaehrdungswert 0..100 (oder null)
 * @param hasCooling    ob bereits eine Kuehlung vorhanden ist (mindert Risiko)
 */
export function overheatingLevel(
  wwrPercent: number,
  hitzeFuture: number | null,
  hasCooling = false,
): OverheatingResult {
  const wwr = Math.min(100, Math.max(0, wwrPercent));
  const score =
    (hitzeFuture != null ? 0.5 * wwr + 0.5 * hitzeFuture : wwr) -
    (hasCooling ? 15 : 0);

  let level: OverheatingLevel = "gering";
  if (score >= 60) level = "hoch";
  else if (score >= 35) level = "mittel";

  const notes: Record<OverheatingLevel, string> = {
    gering: "Geringes Überhitzungsrisiko.",
    mittel:
      "Erhöhtes Überhitzungsrisiko – Verschattung/sommerlicher Wärmeschutz prüfen.",
    hoch: "Hoher Fensteranteil und steigende Hitzebelastung – erhöhtes Überhitzungs- und Kühlrisiko.",
  };

  return { level, score: Math.round(score), note: notes[level] };
}
