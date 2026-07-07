/**
 * Typen und Hilfsfunktionen fuer die Klimarisiko-Analyse (GIS ImmoRisk
 * Naturgefahren, „Standortsteckbrief"). Wird von Server (Route) und Client
 * (Dashboard) gemeinsam genutzt.
 */

export type RiskCategory = "Temperatur" | "Wind" | "Wasser" | "Geophysik";
export type RiskLevel =
  | "sehr gering"
  | "gering"
  | "mittel"
  | "hoch"
  | "sehr hoch";
export type Timeframe = "Referenz" | "Gegenwart" | "nah" | "mittel" | "fern";

export interface Hazard {
  gruppe: string;
  label: string;
  anzeigewert: number;
  unsicherheitsgrad: number;
  unsicherheitstext: string;
  category: RiskCategory;
  timeframe: Timeframe;
  level: RiskLevel;
}

export interface RiskLocation {
  lat: number;
  lon: number;
  xUtm: number;
  yUtm: number;
  strasseHausnummer: string;
  plz: string;
  ort: string;
  matchedLabel: string;
  /**
   * Geocoding-Praezision. Optional, da aeltere gecachte Ergebnisse das Feld
   * nicht haben (dann als "adresse" behandeln, Bestandsdaten nicht degradieren).
   */
  praezision?: "adresse" | "strasse" | "ort";
}

export interface RiskResult {
  location: RiskLocation;
  hazards: Hazard[];
  groups: Record<string, Hazard[]>;
}

const CATEGORY_MAP: Record<string, RiskCategory> = {
  Hitze: "Temperatur",
  Waldbrand: "Temperatur",
  Wintersturm: "Wind",
  Hagel: "Wind",
  Blitzschlag: "Wind",
  Starkregen: "Wasser",
  Schneelast: "Wasser",
  Erdbeben: "Geophysik",
};

export function categorize(gruppe: string): RiskCategory {
  return CATEGORY_MAP[gruppe] ?? "Geophysik";
}

export function timeframeFromLabel(label: string): Timeframe {
  const l = label.toLowerCase();
  if (l.includes("gegenwart")) return "Gegenwart";
  const range = /(\d{4})\s*[-–]\s*(\d{4})/.exec(label);
  if (!range) return "Gegenwart";
  const end = Number(range[2]);
  if (end <= 2000) return "Referenz";
  if (end <= 2050) return "nah";
  if (end <= 2070) return "mittel";
  return "fern";
}

export function levelFromValue(value: number): RiskLevel {
  if (value <= 20) return "sehr gering";
  if (value <= 40) return "gering";
  if (value <= 60) return "mittel";
  if (value <= 80) return "hoch";
  return "sehr hoch";
}

/**
 * Delta-Sicht je Gefahrengruppe (Predium-artig): Gegenwartswert vs. Zukunft
 * "nah" (bis 2050) und "fern" (bis 2070+), inkl. Differenz zur Gegenwart.
 * Bei mehreren Werten je Zeitfenster wird das Maximum verwendet.
 */
export interface HazardDelta {
  gruppe: string;
  category: RiskCategory;
  /** Gegenwartswert (0-100) oder null, wenn nicht vorhanden. */
  present: number | null;
  /** Maximalwert bis 2050 (Timeframe "nah"). */
  near: number | null;
  nearDelta: number | null;
  /** Maximalwert bis 2070+ (Timeframes "mittel"/"fern"). */
  far: number | null;
  farDelta: number | null;
  level: RiskLevel;
}

export function hazardDeltas(hazards: Hazard[]): HazardDelta[] {
  const byGroup = new Map<string, Hazard[]>();
  for (const h of hazards) {
    const list = byGroup.get(h.gruppe) ?? [];
    list.push(h);
    byGroup.set(h.gruppe, list);
  }

  const max = (items: Hazard[]): number | null =>
    items.length === 0
      ? null
      : items.reduce((m, h) => Math.max(m, h.anzeigewert), 0);

  const out: HazardDelta[] = [];
  for (const [gruppe, items] of byGroup) {
    const present = max(items.filter((h) => h.timeframe === "Gegenwart"));
    const near = max(items.filter((h) => h.timeframe === "nah"));
    const far = max(
      items.filter((h) => h.timeframe === "mittel" || h.timeframe === "fern"),
    );
    const worst = Math.max(present ?? 0, near ?? 0, far ?? 0);
    out.push({
      gruppe,
      category: categorize(gruppe),
      present,
      near,
      nearDelta: present != null && near != null ? near - present : null,
      far,
      farDelta: present != null && far != null ? far - present : null,
      level: levelFromValue(worst),
    });
  }
  return out;
}

export function levelColor(level: RiskLevel): string {
  switch (level) {
    case "sehr gering":
      return "oklch(0.75 0.13 150)";
    case "gering":
      return "oklch(0.8 0.13 130)";
    case "mittel":
      return "oklch(0.82 0.14 90)";
    case "hoch":
      return "oklch(0.72 0.16 55)";
    case "sehr hoch":
      return "oklch(0.62 0.2 28)";
  }
}
