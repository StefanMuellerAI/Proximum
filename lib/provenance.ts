/**
 * Provenance je Datenpunkt (Spez. 2.13-2): jedes fachliche Feld traegt
 * {value, source, confidence, updatedAt}. Praezedenz bei konkurrierenden
 * Quellen: manuell > ausweis > vision > typologie; "skalierung" (Kalibrier-
 * Ergebnis) rangiert zwischen ausweis und vision, "import" wie ausweis.
 *
 * Re-Enrichment (neue Vision-/Typologie-Werte) darf manuelle Eingaben NIE
 * automatisch ueberschreiben - nur auf expliziten Nutzerwunsch.
 */
export type ProvenanceSource =
  | "manuell"
  | "ausweis"
  | "import"
  | "skalierung"
  | "vision"
  | "typologie";

export type Confidence = "hoch" | "mittel" | "gering";

export interface Provenanced<T> {
  value: T;
  source: ProvenanceSource;
  confidence?: Confidence;
  updatedAt: string; // ISO-Zeitstempel
}

/** Rangfolge (kleiner = staerker). */
const PRECEDENCE: Record<ProvenanceSource, number> = {
  manuell: 0,
  ausweis: 1,
  import: 1,
  skalierung: 2,
  vision: 3,
  typologie: 4,
};

export function sourcePrecedence(source: ProvenanceSource): number {
  return PRECEDENCE[source];
}

/**
 * Entscheidet, ob ein neuer Wert einen bestehenden ersetzen darf.
 * Gleichrangige Quellen duerfen aktualisieren (neuere Daten derselben
 * Quelle); staerkere Quellen immer; schwaechere nie.
 */
export function mayOverride(
  existing: ProvenanceSource,
  incoming: ProvenanceSource,
): boolean {
  return sourcePrecedence(incoming) <= sourcePrecedence(existing);
}

/** Wendet einen neuen Wert unter Beachtung der Praezedenz an. */
export function applyProvenanced<T>(
  existing: Provenanced<T> | null,
  incoming: Provenanced<T>,
): Provenanced<T> {
  if (existing === null) return incoming;
  return mayOverride(existing.source, incoming.source) ? incoming : existing;
}

export function provenanced<T>(
  value: T,
  source: ProvenanceSource,
  confidence?: Confidence,
): Provenanced<T> {
  return { value, source, confidence, updatedAt: new Date().toISOString() };
}
