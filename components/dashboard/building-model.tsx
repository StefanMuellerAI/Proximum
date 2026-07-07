"use client";

/**
 * Minimalistische 3D-Gebaeudegrafik (Predium-artig, in Proximum-CI):
 * reine SVG-Isometrie aus OSM-Grundrissen – Hauptgebaeude extrudiert in
 * CI-Gruen, Nachbargebaeude flach, Strassen als feine Linien.
 * Keine Map-SDKs, druckfaehig.
 */
import * as React from "react";
import {
  isoProject,
  type FootprintResult,
  type LocalPoint,
} from "@/lib/footprint";

const COLORS = {
  mainTop: "oklch(0.45 0.12 160)",
  wallLight: "oklch(0.36 0.1 160)",
  wallDark: "oklch(0.3 0.09 160)",
  neighborFill: "oklch(0.93 0.005 250)",
  neighborStroke: "oklch(0.87 0.008 250)",
  road: "oklch(0.9 0.006 250)",
};

interface Props {
  footprint: FootprintResult;
  className?: string;
  /** Fixe Pixelmasse (fuer den Print-Report); sonst responsiv. */
  width?: number;
  height?: number;
}

function pathFrom(points: [number, number][], close: boolean): string {
  return (
    points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") +
    (close ? " Z" : "")
  );
}

export function BuildingModel({ footprint, className, width, height }: Props) {
  const scene = React.useMemo(() => buildScene(footprint), [footprint]);
  if (!scene) return null;

  return (
    <svg
      viewBox={scene.viewBox}
      className={className}
      width={width}
      height={height}
      role="img"
      aria-label="Gebäude und Umgebung (Grundriss aus OpenStreetMap)"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Strassen */}
      {scene.roads.map((d, i) => (
        <path
          key={`r${i}`}
          d={d}
          fill="none"
          stroke={COLORS.road}
          strokeWidth={scene.roadWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* Nachbargebaeude (flach) */}
      {scene.neighbors.map((d, i) => (
        <path
          key={`n${i}`}
          d={d}
          fill={COLORS.neighborFill}
          stroke={COLORS.neighborStroke}
          strokeWidth={scene.roadWidth / 4}
        />
      ))}
      {/* Hauptgebaeude: Waende (hinten -> vorn), dann Dachflaeche */}
      {scene.walls.map((w, i) => (
        <path key={`w${i}`} d={w.d} fill={w.fill} />
      ))}
      {scene.top && <path d={scene.top} fill={COLORS.mainTop} />}
    </svg>
  );
}

interface Scene {
  viewBox: string;
  roads: string[];
  neighbors: string[];
  walls: { d: string; fill: string }[];
  top: string | null;
  roadWidth: number;
}

function buildScene(fp: FootprintResult): Scene | null {
  const main = fp.buildings.find((b) => b.main) ?? null;
  if (!main && fp.buildings.length === 0) return null;

  const project = (p: LocalPoint, z: number) => isoProject(p[0], p[1], z);

  // Bildausschnitt: aufs Hauptgebaeude fokussieren (Nachbarn/Strassen werden
  // vom SVG-viewBox automatisch beschnitten); ohne Hauptgebaeude alle Gebaeude.
  const framePts: [number, number][] = [];
  const track = (pt: [number, number]) => {
    framePts.push(pt);
    return pt;
  };
  if (main) {
    for (const p of main.points) {
      track(project(p, 0));
      track(project(p, main.heightM));
    }
  } else {
    for (const b of fp.buildings) for (const p of b.points) track(project(p, 0));
  }

  const roads = fp.roads.map((r) =>
    pathFrom(r.points.map((p) => project(p, 0)), false),
  );

  const neighbors = fp.buildings
    .filter((b) => !b.main)
    .map((b) => pathFrom(b.points.map((p) => project(p, 0)), true));

  // Hauptgebaeude extrudieren
  const walls: { d: string; fill: string }[] = [];
  let top: string | null = null;
  if (main) {
    const h = main.heightM;
    const pts = main.points;
    // Waende: je Kante ein Quad, hinten (kleines x+y) zuerst zeichnen
    const edges = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return { p, q, depth: (p[0] + p[1] + q[0] + q[1]) / 2 };
    });
    edges.sort((a, b) => a.depth - b.depth);
    for (const { p, q } of edges) {
      const quad: [number, number][] = [
        project(p, 0),
        project(q, 0),
        project(q, h),
        project(p, h),
      ];
      // Zwei Wandtoene je nach Kantenrichtung (einfaches Licht von Osten)
      const dx = Math.abs(q[0] - p[0]);
      const dy = Math.abs(q[1] - p[1]);
      walls.push({
        d: pathFrom(quad, true),
        fill: dx > dy ? COLORS.wallLight : COLORS.wallDark,
      });
    }
    top = pathFrom(pts.map((p) => project(p, h)), true);
  }

  if (framePts.length === 0) return null;
  const xs = framePts.map((p) => p[0]);
  const ys = framePts.map((p) => p[1]);
  // Grosszuegiger Rahmen ums Hauptgebaeude, damit Kontext sichtbar bleibt
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const pad = Math.max(spanX, spanY, 30) * 0.9;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad * 0.75;
  const maxY = Math.max(...ys) + pad * 0.35;
  const w = maxX - minX;
  const hgt = maxY - minY;

  return {
    viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${hgt.toFixed(1)}`,
    roads,
    neighbors,
    walls,
    top,
    roadWidth: Math.max(w / 160, 1.2),
  };
}
