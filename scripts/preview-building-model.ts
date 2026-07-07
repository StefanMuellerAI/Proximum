/**
 * Visuelle Verifikation der BuildingModel-Grafik ohne Login:
 * holt echte OSM-Daten (Overpass) fuer eine Beispieladresse, rendert die
 * echte React-Komponente serverseitig und schreibt eine HTML-Vorschau.
 *
 * Aufruf: npx vitest run --config vitest.preview.config.ts
 */
import { it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuildingModel } from "@/components/dashboard/building-model";
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

// Frankfurter Strasse 94, 65239 Hochheim (Adresse aus dem Predium-Report)
const LAT = 50.0188253;
const LON = 8.3723258;

interface OverpassElement {
  type: string;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

it("rendert die Gebaeudegrafik mit echten OSM-Daten", async () => {
  const query = `[out:json][timeout:15];
(
  way["building"](around:140,${LAT},${LON});
  way["highway"](around:180,${LAT},${LON});
);
out geom;`;
  // Lokaler Cache, um Overpass bei wiederholten Vorschau-Laeufen zu schonen
  const CACHE = "/tmp/proximum-overpass-cache.json";
  let data: { elements: OverpassElement[] } | null = existsSync(CACHE)
    ? (JSON.parse(readFileSync(CACHE, "utf8")) as { elements: OverpassElement[] })
    : null;
  if (!data)
  for (const url of [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Proximum/1.0 (ESG-Gebaeudeanalyse)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) {
        data = (await res.json()) as { elements: OverpassElement[] };
        break;
      }
    } catch {
      // naechster Mirror
    }
  }
  if (!data) throw new Error("Overpass nicht erreichbar");
  writeFileSync(CACHE, JSON.stringify(data));

  const toLocal = (g: { lat: number; lon: number }): LocalPoint =>
    lonLatToLocal(LAT, LON, g.lat, g.lon);

  const buildings: FootprintBuilding[] = [];
  const roads: FootprintRoad[] = [];
  for (const el of data.elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    if (el.tags?.building) {
      const points = el.geometry.slice(0, -1).map(toLocal);
      if (points.length >= 3)
        buildings.push({ points, heightM: estimateHeight(el.tags, 9), main: false });
    } else if (el.tags?.highway) {
      roads.push({ points: el.geometry.map(toLocal) });
    }
  }
  const origin: LocalPoint = [0, 0];
  let mainIdx = buildings.findIndex((b) => pointInPolygon(origin, b.points));
  if (mainIdx < 0) {
    let best = 60;
    for (let i = 0; i < buildings.length; i++) {
      const [cx, cy] = polygonCentroid(buildings[i].points);
      const d = Math.hypot(cx, cy);
      if (d < best) {
        best = d;
        mainIdx = i;
      }
    }
  }
  if (mainIdx >= 0) buildings[mainIdx].main = true;

  const footprint: FootprintResult = {
    center: { lat: LAT, lon: LON },
    buildings,
    roads,
    source: "osm",
    fetchedAt: new Date().toISOString(),
  };

  const svg = renderToStaticMarkup(
    React.createElement(BuildingModel, {
      footprint,
      width: 760,
      height: 480,
    }),
  );

  const html = `<!doctype html><html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#eef1f4;font-family:sans-serif">
<div style="background:#f6f8fa;border:1px solid #d8dde3;border-radius:12px;padding:12px">${svg}</div>
</body></html>`;
  writeFileSync("/tmp/proximum-building-preview.html", html);
  console.log(
    `Gebäude: ${buildings.length} (main: ${buildings.some((b) => b.main)}), Straßen: ${roads.length}`,
  );
});
