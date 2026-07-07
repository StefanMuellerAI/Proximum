"use client";

/**
 * Fassaden-/Luftbild-Analyse: wartet die Schraeg-Luftaufnahme ab, ruft dann
 * /api/facade auf (ein Call, beide Bilder) und meldet das Ergebnis zurueck.
 * Ein DB-Cache-Treffer aus der Gebaeude-Zeile ueberspringt den Abruf komplett.
 */
import * as React from "react";
import type { FacadeResult } from "@/lib/facade";
import type { RiskStatus } from "@/hooks/use-risk";

export type FacadeStatus = "idle" | "loading" | "error" | "done";

export interface UseFacadeParams {
  address: string | null;
  coords: { lat: number; lon: number } | null;
  buildingId: string | null;
  cached: FacadeResult | null;
  /** Risiko-Status: bei Fehler wird ohne 3D-Luftbild fortgefahren. */
  riskStatus: RiskStatus;
  /** Uebernimmt WWR/PV aus dem Bild in das Gebaeude (sofern nicht manuell). */
  onApplyToBuilding: (facade: FacadeResult) => void;
}

export interface UseFacadeResult {
  facade: FacadeResult | null;
  status: FacadeStatus;
  /** true = Luftbild-Phase abgeschlossen (Capture fertig oder uebersprungen). */
  aerialResolved: boolean;
  /** Callback fuer die AerialCapture-Komponente. */
  handleAerial: (url: string | null) => void;
}

export function useFacade({
  address,
  coords,
  buildingId,
  cached,
  riskStatus,
  onApplyToBuilding,
}: UseFacadeParams): UseFacadeResult {
  const [facade, setFacade] = React.useState<FacadeResult | null>(null);
  const [status, setStatus] = React.useState<FacadeStatus>("idle");
  const [aerialResolved, setAerialResolved] = React.useState(false);
  const aerialUrlRef = React.useRef<string | null>(null);
  const startedRef = React.useRef(false);
  const applyRef = React.useRef(onApplyToBuilding);
  applyRef.current = onApplyToBuilding;

  // DB-Cache-Treffer: kein erneuter Abruf, keine Luftbild-Phase.
  React.useEffect(() => {
    if (cached && !startedRef.current) {
      startedRef.current = true;
      setFacade(cached);
      setStatus("done");
      setAerialResolved(true);
    }
  }, [cached]);

  // Ohne Standort (Risiko-Fehler) direkt ohne 3D-Luftbild weiter.
  React.useEffect(() => {
    if (riskStatus === "error") setAerialResolved(true);
  }, [riskStatus]);

  const handleAerial = React.useCallback((url: string | null) => {
    aerialUrlRef.current = url;
    setAerialResolved(true);
  }, []);

  // Analyse startet, sobald die Luftbild-Phase fertig ist.
  React.useEffect(() => {
    if (!address || !aerialResolved || startedRef.current) return;
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
        aerialImageDataUrl: aerialUrlRef.current ?? undefined,
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
  }, [address, aerialResolved, coords?.lat, coords?.lon, buildingId]);

  return { facade, status, aerialResolved, handleAerial };
}
