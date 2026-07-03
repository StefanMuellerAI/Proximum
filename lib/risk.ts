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
