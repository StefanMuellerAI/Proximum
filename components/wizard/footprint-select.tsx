"use client";

/**
 * Karten-Selektion (A6, Schritt 3): 2D-Draufsicht der OSM-Grundrisse.
 * Der Nutzer waehlt per Klick die Polygone an/ab, die zum Ausweis-Gebaeude
 * gehoeren (Mehrfachauswahl statt einzelnem main-Flag).
 */
import * as React from "react";
import type { FootprintResult } from "@/lib/footprint";
import { isSelected } from "@/lib/footprint";

interface Props {
  footprint: FootprintResult;
  onToggle: (index: number) => void;
  width?: number;
  height?: number;
}

export function FootprintSelect({
  footprint,
  onToggle,
  width = 640,
  height = 420,
}: Props) {
  // Bounds aller Gebaeude (Meter, y = Norden)
  const bounds = React.useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const b of footprint.buildings) {
      for (const [x, y] of b.points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!Number.isFinite(minX)) return { minX: -50, maxX: 50, minY: -50, maxY: 50 };
    const pad = 12;
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }, [footprint]);

  const scale = Math.min(
    width / (bounds.maxX - bounds.minX),
    height / (bounds.maxY - bounds.minY),
  );
  // y invertieren (SVG waechst nach unten, Norden soll oben sein)
  const tx = (x: number) => (x - bounds.minX) * scale;
  const ty = (y: number) => height - (y - bounds.minY) * scale;

  const toPath = (points: [number, number][]) =>
    points.map(([x, y]) => `${tx(x).toFixed(1)},${ty(y).toFixed(1)}`).join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Gebäudeauswahl auf der Karte"
      className="rounded-lg border bg-[#f4f7f5]"
    >
      {/* Strassen als Kontext */}
      {footprint.roads.map((r, i) => (
        <polyline
          key={`road-${i}`}
          points={toPath(r.points)}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={4}
          strokeLinecap="round"
        />
      ))}
      {footprint.buildings.map((b, i) => {
        const sel = isSelected(b);
        return (
          <polygon
            key={`b-${b.osmRef ?? i}`}
            points={toPath(b.points)}
            fill={sel ? "rgba(14,122,82,0.55)" : "rgba(100,116,139,0.25)"}
            stroke={sel ? "#0a5c3e" : "#94a3b8"}
            strokeWidth={sel ? 2 : 1}
            style={{ cursor: "pointer" }}
            onClick={() => onToggle(i)}
          >
            <title>
              {sel ? "Zum Gebäude zugehörig (Klick entfernt)" : "Klick fügt zum Gebäude hinzu"}
            </title>
          </polygon>
        );
      })}
      {/* Adress-Anker (Abfragezentrum) */}
      <circle cx={tx(0)} cy={ty(0)} r={5} fill="#dc2626" stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
