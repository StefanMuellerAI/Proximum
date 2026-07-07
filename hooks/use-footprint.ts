"use client";

/**
 * Laedt den OSM-Grundriss (Hauptgebaeude + Umgebung) fuer die minimalistische
 * Gebaeudegrafik. Ein DB-Cache-Treffer aus der Gebaeude-Zeile ueberspringt
 * den Abruf; Fehler blenden die Grafik einfach aus.
 */
import * as React from "react";
import type { FootprintResult } from "@/lib/footprint";

export function useFootprint(
  coords: { lat: number; lon: number } | null,
  buildingId: string | null,
  cached: FootprintResult | null,
): FootprintResult | null {
  const [footprint, setFootprint] = React.useState<FootprintResult | null>(null);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (cached && !startedRef.current) {
      startedRef.current = true;
      setFootprint(cached);
    }
  }, [cached]);

  React.useEffect(() => {
    if (!coords || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    fetch("/api/footprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: coords.lat,
        lon: coords.lon,
        buildingId: buildingId ?? undefined,
      }),
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as FootprintResult;
      })
      .then((d) => {
        if (!cancelled && d && d.buildings.length > 0) setFootprint(d);
      })
      .catch(() => {
        // Grafik ist optional – Fehler still ignorieren
      });
    return () => {
      cancelled = true;
    };
  }, [coords, buildingId]);

  return footprint;
}
