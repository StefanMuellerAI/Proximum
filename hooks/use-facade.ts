"use client";

/**
 * Fassaden-Analyse: ruft /api/facade auf (Street-View-WWR + Solar-API-PV),
 * sobald Adresse und – falls verfuegbar – Koordinaten aus der Risiko-
 * Geokodierung vorliegen. Ein DB-Cache-Treffer aus der Gebaeude-Zeile
 * ueberspringt den Abruf komplett.
 */
import * as React from "react";
import type { FacadeResult } from "@/lib/facade";
import type { RiskResult } from "@/lib/risk";
import type { RiskStatus } from "@/hooks/use-risk";

export type FacadeStatus = "idle" | "loading" | "error" | "done";

export interface UseFacadeParams {
  address: string | null;
  coords: { lat: number; lon: number } | null;
  /** Geocoding-Praezision aus der Risiko-Analyse (Gate gegen falsche Gebaeude). */
  praezision: RiskResult["location"]["praezision"] | null;
  buildingId: string | null;
  cached: FacadeResult | null;
  /** Risiko-Status: Analyse startet erst nach Abschluss der Geokodierung. */
  riskStatus: RiskStatus;
  /** Uebernimmt WWR/PV aus dem Ergebnis in das Gebaeude (sofern nicht manuell). */
  onApplyToBuilding: (facade: FacadeResult) => void;
}

export interface UseFacadeResult {
  facade: FacadeResult | null;
  status: FacadeStatus;
}

export function useFacade({
  address,
  coords,
  praezision,
  buildingId,
  cached,
  riskStatus,
  onApplyToBuilding,
}: UseFacadeParams): UseFacadeResult {
  const [facade, setFacade] = React.useState<FacadeResult | null>(null);
  const [status, setStatus] = React.useState<FacadeStatus>("idle");
  const startedRef = React.useRef(false);
  const applyRef = React.useRef(onApplyToBuilding);
  applyRef.current = onApplyToBuilding;

  // DB-Cache-Treffer (neue Pipeline mit solar-Feld): kein erneuter Abruf.
  React.useEffect(() => {
    if (cached && cached.solar !== undefined && !startedRef.current) {
      startedRef.current = true;
      setFacade(cached);
      setStatus("done");
      applyRef.current(cached);
    }
  }, [cached]);

  // Analyse startet, sobald die Risiko-Geokodierung abgeschlossen ist
  // (done -> Koordinaten + Praezision vorhanden, error -> Adresse reicht).
  React.useEffect(() => {
    if (!address || startedRef.current) return;
    if (riskStatus !== "done" && riskStatus !== "error") return;
    startedRef.current = true;
    let cancelled = false;
    setStatus("loading");
    fetch("/api/facade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        lat: coords?.lat,
        lon: coords?.lon,
        praezision: praezision ?? undefined,
        buildingId: buildingId ?? undefined,
      }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Fehler");
        return d as FacadeResult;
      })
      .then((d) => {
        if (cancelled) return;
        setFacade(d);
        setStatus("done");
        applyRef.current(d);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [address, riskStatus, coords?.lat, coords?.lon, praezision, buildingId]);

  return { facade, status };
}
