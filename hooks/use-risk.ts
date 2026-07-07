"use client";

/**
 * Klimarisiko-Abruf je Adresse mit DB-Cache-Unterstuetzung: liegt aus der
 * Gebaeude-Zeile bereits ein Ergebnis vor, wird nicht erneut abgerufen.
 */
import * as React from "react";
import type { RiskResult } from "@/lib/risk";

export type RiskStatus = "idle" | "loading" | "error" | "done";

export interface UseRiskResult {
  risk: RiskResult | null;
  status: RiskStatus;
  error: string | null;
}

export function useRisk(
  address: string | null,
  buildingId: string | null,
  cached: RiskResult | null,
): UseRiskResult {
  const [risk, setRisk] = React.useState<RiskResult | null>(null);
  const [status, setStatus] = React.useState<RiskStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  /** Adresse, fuer die bereits ein (gecachtes) Ergebnis vorliegt. */
  const cachedForRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!address) return;
    if (cachedForRef.current === address) return;

    // DB-Cache aus der Gebaeude-Zeile hat Vorrang vor einem Abruf.
    if (cached) {
      cachedForRef.current = address;
      setRisk(cached);
      setStatus("done");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);
    fetch("/api/risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, buildingId: buildingId ?? undefined }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Fehler");
        return d as RiskResult;
      })
      .then((d) => {
        if (!cancelled) {
          setRisk(d);
          setStatus("done");
          cachedForRef.current = address;
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Fehler");
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [address, buildingId, cached]);

  return { risk, status, error };
}
