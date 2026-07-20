/**
 * Typen und Geometrie-Helfer fuer die minimalistische Gebaeudegrafik
 * (OSM-Grundrisse via Overpass, gerendert als SVG-Isometrie).
 * Wird von der Footprint-API (Server) und der BuildingModel-Komponente
 * (Client) gemeinsam genutzt.
 */

/** Punkt in lokalen Meter-Koordinaten relativ zum Abfragezentrum. */
export type LocalPoint = [number, number];

export interface FootprintBuilding {
  /** Geschlossenes Polygon (letzter Punkt != erster Punkt). */
  points: LocalPoint[];
  /** Extrusionshoehe in Metern (aus OSM height/building:levels genaehert). */
  heightM: number;
  /** true = analysiertes Hauptgebaeude. */
  main: boolean;
  /** Stabile OSM-Way-Referenz (fuer Selektion/Wiedererkennung, A6). */
  osmRef?: number;
  /**
   * Nutzer-Selektion (A6): true = gehoert zum Ausweis-Gebaeude. Fehlt das
   * Feld, gilt das main-Flag als Selektion (Alt-Daten bleiben gueltig).
   */
  selected?: boolean;
}

/** Effektive Selektion eines Polygons (Fallback: main-Flag). */
export function isSelected(b: FootprintBuilding): boolean {
  return b.selected ?? b.main;
}

export interface FootprintRoad {
  points: LocalPoint[];
}

export interface FootprintResult {
  center: { lat: number; lon: number };
  /** Hauptgebaeude zuerst (falls gefunden). */
  buildings: FootprintBuilding[];
  roads: FootprintRoad[];
  source: "osm";
  fetchedAt: string;
}

const EARTH_M_PER_DEG_LAT = 111_320;

/** Laengen-/Breitengrad -> lokale Meter relativ zu einem Zentrum. */
export function lonLatToLocal(
  centerLat: number,
  centerLon: number,
  lat: number,
  lon: number,
): LocalPoint {
  const mPerDegLon = EARTH_M_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180);
  const x = (lon - centerLon) * mPerDegLon;
  // y nach "Norden oben" (positive y = noerdlich)
  const y = (lat - centerLat) * EARTH_M_PER_DEG_LAT;
  return [Number(x.toFixed(1)), Number(y.toFixed(1))];
}

/** Punkt-in-Polygon (Ray Casting). */
export function pointInPolygon(pt: LocalPoint, polygon: LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(polygon: LocalPoint[]): LocalPoint {
  let x = 0;
  let y = 0;
  for (const [px, py] of polygon) {
    x += px;
    y += py;
  }
  return [x / polygon.length, y / polygon.length];
}

/**
 * Gebaeudehoehe aus OSM-Tags naehern: explizite height, sonst
 * building:levels x 3,3 m, sonst Default.
 */
export function estimateHeight(
  tags: Record<string, string> | undefined,
  fallbackM: number,
): number {
  const h = Number(String(tags?.height ?? "").replace(",", "."));
  if (Number.isFinite(h) && h > 2 && h < 300) return Math.round(h * 10) / 10;
  const levels = Number(tags?.["building:levels"]);
  if (Number.isFinite(levels) && levels > 0 && levels < 80)
    return Math.round(levels * 3.3 * 10) / 10;
  return fallbackM;
}

/**
 * Isometrische Projektion (2:1-Axonometrie) fuer die SVG-Darstellung.
 * x nach Osten, y nach Norden, z nach oben (Meter) -> Bildschirmkoordinaten
 * (y waechst nach unten).
 */
export function isoProject(
  x: number,
  y: number,
  z: number,
): [number, number] {
  const sx = (x - y) * 0.866;
  const sy = (x + y) * 0.5 - z;
  return [sx, sy];
}
