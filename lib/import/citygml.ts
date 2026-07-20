/**
 * LoD2-Open-Data-Importer (2.13-14): CityGML der Bundeslaender (NRW, Bayern,
 * Thueringen, HH, BE u. a. - kostenlos) -> Huellflaechen, Dachgeometrie,
 * Volumen, EBF.
 *
 * Ersetzt Prediums ZSHH-Bezug und uebertrifft ihn kombiniert mit der
 * Vision-Fassadenanalyse (WWR): LoD2 liefert exakte Wand-/Dach-/Grund-
 * flaechen, die Vision liefert den Fensteranteil.
 *
 * Parser: string-basiert (gml:posList mit 3D-Koordinaten je Flaeche),
 * Flaechen nach Newell-Methode; kein XML-Paket noetig. Unterstuetzt
 * bldg:WallSurface / RoofSurface / GroundSurface (CityGML 1.0/2.0).
 */

export interface LoD2Building {
  gmlId: string | null;
  wallAreaM2: number;
  roofAreaM2: number;
  groundAreaM2: number;
  /** Gebaeudehoehe (aus measuredHeight oder Koordinaten-Spanne). */
  heightM: number;
  /** Naeherung: Grundflaeche x Hoehe. */
  volumeM3: number;
  /** EBF-Naeherung: Volumen / 2,5 m Stockwerkshoehe x 0,32-Anteil?
   *  Konvention (Spez. 2.1): EBF aus 3D-Volumen mit Stockwerkshoehe 2,5 m,
   *  d. h. Geschossflaeche = Volumen / 2,5. */
  ebfM2: number;
}

type Vec3 = [number, number, number];

/** Flaeche eines 3D-Polygons (Newell-Methode). */
export function polygonArea3d(points: Vec3[]): number {
  if (points.length < 3) return 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1, z1] = points[i];
    const [x2, y2, z2] = points[(i + 1) % points.length];
    nx += (y1 - y2) * (z1 + z2);
    ny += (z1 - z2) * (x1 + x2);
    nz += (x1 - x2) * (y1 + y2);
  }
  return Math.hypot(nx, ny, nz) / 2;
}

function parsePosList(text: string): Vec3[] {
  const nums = text
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const points: Vec3[] = [];
  for (let i = 0; i + 2 < nums.length; i += 3)
    points.push([nums[i], nums[i + 1], nums[i + 2]]);
  // GML-Ringe wiederholen den ersten Punkt am Ende
  if (
    points.length > 1 &&
    points[0].every((v, i) => v === points[points.length - 1][i])
  )
    points.pop();
  return points;
}

/** Summierte Flaeche aller gml:posList-Polygone in einem XML-Fragment. */
function surfaceArea(fragment: string): number {
  let area = 0;
  for (const m of fragment.matchAll(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)) {
    area += polygonArea3d(parsePosList(m[1]));
  }
  return area;
}

function allZ(fragment: string): number[] {
  const zs: number[] = [];
  for (const m of fragment.matchAll(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)) {
    const pts = parsePosList(m[1]);
    for (const p of pts) zs.push(p[2]);
  }
  return zs;
}

export const LOD2_STOREY_HEIGHT_M = 2.5;

/** Parst alle bldg:Building-Objekte einer CityGML-Datei. */
export function parseCityGml(xml: string): LoD2Building[] {
  const out: LoD2Building[] = [];
  // Building-Bloecke (tolerant: cityObjectMember-Wrapper oder direkt)
  for (const bm of xml.matchAll(
    /<bldg:Building\b([^>]*)>([\s\S]*?)<\/bldg:Building>/g,
  )) {
    const attrs = bm[1];
    const body = bm[2];
    const gmlId = attrs.match(/gml:id="([^"]+)"/)?.[1] ?? null;

    const sumSurfaces = (tag: string): number => {
      let area = 0;
      for (const sm of body.matchAll(
        new RegExp(`<bldg:${tag}\\b[^>]*>([\\s\\S]*?)</bldg:${tag}>`, "g"),
      ))
        area += surfaceArea(sm[1]);
      return area;
    };

    let wallAreaM2 = sumSurfaces("WallSurface");
    let roofAreaM2 = sumSurfaces("RoofSurface");
    let groundAreaM2 = sumSurfaces("GroundSurface");

    // measuredHeight bevorzugt, sonst Z-Spanne der Geometrie
    const measured = body.match(
      /<bldg:measuredHeight[^>]*>([\d.,]+)<\/bldg:measuredHeight>/,
    );
    const zs = allZ(body);
    const zSpan = zs.length > 0 ? Math.max(...zs) - Math.min(...zs) : 0;
    const heightM = measured
      ? Number(measured[1].replace(",", "."))
      : Number(zSpan.toFixed(1));

    // LoD1-Fallback (nur lod1Solid, keine typisierten Flaechen):
    // grobe Ableitung aus Gesamtgeometrie nicht moeglich -> ueberspringen,
    // wenn gar keine Flaechen gefunden wurden.
    if (wallAreaM2 === 0 && roofAreaM2 === 0 && groundAreaM2 === 0) continue;

    // Bei fehlender GroundSurface: Dachflaeche (projiziert) als Naeherung
    if (groundAreaM2 === 0 && roofAreaM2 > 0) groundAreaM2 = roofAreaM2 * 0.9;
    if (roofAreaM2 === 0 && groundAreaM2 > 0) roofAreaM2 = groundAreaM2;
    if (wallAreaM2 === 0 && groundAreaM2 > 0 && heightM > 0)
      wallAreaM2 = 4 * Math.sqrt(groundAreaM2) * heightM;

    const volumeM3 = groundAreaM2 * heightM;
    const ebfM2 = volumeM3 / LOD2_STOREY_HEIGHT_M;

    out.push({
      gmlId,
      wallAreaM2: Number(wallAreaM2.toFixed(1)),
      roofAreaM2: Number(roofAreaM2.toFixed(1)),
      groundAreaM2: Number(groundAreaM2.toFixed(1)),
      heightM,
      volumeM3: Number(volumeM3.toFixed(1)),
      ebfM2: Number(ebfM2.toFixed(1)),
    });
  }
  return out;
}

import type { ThermalComponent } from "@/lib/engine/thermal/model";
import { ageClassDefaults } from "@/lib/engine/thermal/tabula";

/**
 * Bauteil-Set fuer das thermische Modell aus LoD2-Flaechen + Vision-WWR:
 * exakte Huellflaechen (LoD2) + Fensteranteil aus der Fassadenanalyse
 * (PLUS-2) - praeziser als Prediums TABULA-Verteilungsannahme.
 */
export function thermalComponentsFromLoD2(
  lod2: LoD2Building,
  wwrPercent: number,
  baujahr: number,
): ThermalComponent[] {
  const age = ageClassDefaults(baujahr);
  const windowM2 = lod2.wallAreaM2 * (wwrPercent / 100);
  return [
    {
      type: "wand",
      areaM2: lod2.wallAreaM2 - windowM2,
      base: age.wall,
      insulation: null,
      bFactor: 1,
    },
    { type: "fenster", areaM2: windowM2, directU: age.windowU, bFactor: 1 },
    { type: "dach", areaM2: lod2.roofAreaM2, base: age.roof, insulation: null, bFactor: 1 },
    {
      type: "kellerdecke",
      areaM2: lod2.groundAreaM2,
      base: age.floor,
      insulation: null,
      bFactor: 0.6,
    },
  ];
}
