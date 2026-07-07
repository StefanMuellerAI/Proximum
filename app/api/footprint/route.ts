import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { getOwnerScope, requireUser } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import {
  estimateHeight,
  lonLatToLocal,
  pointInPolygon,
  polygonCentroid,
  type FootprintBuilding,
  type FootprintResult,
  type FootprintRoad,
  type LocalPoint,
} from "@/lib/footprint";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Primaere Instanz + Mirror (Overpass ist ein freier Community-Dienst). */
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
/** Suchradius um die Adresse (Meter). */
const RADIUS_M = 140;
/** Max. Anzahl Nachbargebaeude/Strassen in der Antwort (Payload-Begrenzung). */
const MAX_NEIGHBORS = 50;
const MAX_ROADS = 30;

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

export async function POST(req: Request) {
  const userId = await requireUser();
  if (!userId)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  const limit = await checkRateLimit("risk", userId);
  if (!limit.ok) return rateLimitResponse(limit);

  let lat: number | undefined;
  let lon: number | undefined;
  let buildingId: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.lat === "number") lat = body.lat;
    if (typeof body?.lon === "number") lon = body.lon;
    if (typeof body?.buildingId === "string") buildingId = body.buildingId;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  if (lat == null || lon == null)
    return NextResponse.json({ error: "lat/lon nötig." }, { status: 400 });

  // DB-Cache: Grundrisse aendern sich praktisch nie -> ein Abruf je Gebaeude.
  const scope = buildingId && hasDatabase() ? await getOwnerScope() : null;
  if (buildingId && scope) {
    try {
      const [row] = await getDb()
        .select({ footprint: buildings.footprint })
        .from(buildings)
        .where(and(eq(buildings.id, buildingId), scopeFilter(scope)))
        .limit(1);
      if (row?.footprint) return NextResponse.json(row.footprint);
    } catch {
      // Cache-Fehler ignorieren
    }
  }

  const query = `[out:json][timeout:15];
(
  way["building"](around:${RADIUS_M},${lat},${lon});
  way["highway"](around:${RADIUS_M + 40},${lat},${lon});
);
out geom;`;

  let elements: OverpassElement[] | null = null;
  let lastError = "Overpass-Fehler";
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Overpass verlangt einen identifizierenden User-Agent (406 sonst)
          "User-Agent": "Proximum/1.0 (ESG-Gebaeudeanalyse)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Overpass-Fehler (${res.status})`);
      const data = (await res.json()) as { elements?: OverpassElement[] };
      elements = data.elements ?? [];
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Overpass-Fehler";
    }
  }
  if (elements === null)
    return NextResponse.json({ error: lastError }, { status: 502 });

  const toLocal = (g: { lat: number; lon: number }): LocalPoint =>
    lonLatToLocal(lat!, lon!, g.lat, g.lon);

  const buildingsOut: FootprintBuilding[] = [];
  const roadsOut: FootprintRoad[] = [];

  for (const el of elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    if (el.tags?.building) {
      const points = el.geometry.slice(0, -1).map(toLocal);
      if (points.length < 3) continue;
      buildingsOut.push({
        points,
        heightM: estimateHeight(el.tags, 9),
        main: false,
      });
    } else if (el.tags?.highway) {
      roadsOut.push({ points: el.geometry.map(toLocal) });
    }
  }

  // Hauptgebaeude bestimmen: Polygon am Punkt, sonst naechstes Zentrum <= 60 m
  const origin: LocalPoint = [0, 0];
  let mainIdx = buildingsOut.findIndex((b) => pointInPolygon(origin, b.points));
  if (mainIdx < 0) {
    let bestDist = 60;
    for (let i = 0; i < buildingsOut.length; i++) {
      const [cx, cy] = polygonCentroid(buildingsOut[i].points);
      const d = Math.hypot(cx, cy);
      if (d < bestDist) {
        bestDist = d;
        mainIdx = i;
      }
    }
  }
  if (mainIdx >= 0) {
    buildingsOut[mainIdx].main = true;
    // Hauptgebaeude nach vorn sortieren
    const [main] = buildingsOut.splice(mainIdx, 1);
    buildingsOut.unshift(main);
  }

  const result: FootprintResult = {
    center: { lat, lon },
    buildings: buildingsOut.slice(0, MAX_NEIGHBORS + 1),
    roads: roadsOut.slice(0, MAX_ROADS),
    source: "osm",
    fetchedAt: new Date().toISOString(),
  };

  // Nur cachen, wenn ein Hauptgebaeude gefunden wurde (sonst spaeter erneut)
  if (buildingId && scope && result.buildings.some((b) => b.main)) {
    try {
      await getDb()
        .update(buildings)
        .set({ footprint: result, cachedAt: new Date() })
        .where(and(eq(buildings.id, buildingId), scopeFilter(scope)));
    } catch {
      // Cache-Schreiben best effort
    }
  }

  return NextResponse.json(result);
}
