"use client";

/**
 * Laedt das Gebaeude (per ?id= aus der DB oder zustandsloser Fallback) und
 * schreibt Overrides/Massnahmen-Auswahl debounced per PATCH zurueck.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import type { NormalizedBuilding, CarrierShare } from "@/lib/schema";
import { CARRIERS, type CarrierKey } from "@/lib/data/reference";
import { loadAnalysis } from "@/lib/session";
import type { RiskResult } from "@/lib/risk";
import type { FacadeResult } from "@/lib/facade";
import type { FootprintResult } from "@/lib/footprint";

function simplePerCarrier(
  carrier: CarrierKey,
  heat: number,
  elec: number,
): CarrierShare[] {
  const c = CARRIERS[carrier];
  const shares: CarrierShare[] = [
    {
      carrier,
      label: c.label,
      heatKwhM2a: c.isElectric ? 0 : heat,
      electricityKwhM2a: c.isElectric ? heat : 0,
    },
  ];
  if (elec > 0) {
    shares.push({
      carrier: "strom_netz",
      label: CARRIERS.strom_netz.label,
      heatKwhM2a: 0,
      electricityKwhM2a: elec,
    });
  }
  return shares;
}

export interface UseBuildingResult {
  building: NormalizedBuilding | null;
  ready: boolean;
  selected: string[];
  /** Aus der DB-Zeile mitgeladene Cache-Ergebnisse (nur bei ?id=). */
  cachedRisk: RiskResult | null;
  cachedFacade: FacadeResult | null;
  cachedFootprint: FootprintResult | null;
  patchBuilding: (patch: Partial<NormalizedBuilding>) => void;
  setBuilding: React.Dispatch<React.SetStateAction<NormalizedBuilding | null>>;
  toggleMeasure: (id: string) => void;
  applyPackage: (measureIds: string[]) => void;
}

export function useBuilding(buildingId: string | null): UseBuildingResult {
  const router = useRouter();
  const [building, setBuilding] = React.useState<NormalizedBuilding | null>(null);
  const [ready, setReady] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [cachedRisk, setCachedRisk] = React.useState<RiskResult | null>(null);
  const [cachedFacade, setCachedFacade] = React.useState<FacadeResult | null>(null);
  const [cachedFootprint, setCachedFootprint] =
    React.useState<FootprintResult | null>(null);
  const persistReadyRef = React.useRef(false);

  // Laden: DB (?id=) oder zustandsloser Fallback (Demo / sessionStorage)
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (buildingId) {
        try {
          const res = await fetch(`/api/buildings/${buildingId}`);
          if (res.ok) {
            const data = await res.json();
            if (cancelled) return;
            const row = data.building;
            setBuilding(row.normalized as NormalizedBuilding);
            setSelected(
              Array.isArray(row.selectedMeasures) ? row.selectedMeasures : [],
            );
            if (row.riskResult) setCachedRisk(row.riskResult as RiskResult);
            if (row.facadeResult)
              setCachedFacade(row.facadeResult as FacadeResult);
            if (row.footprint)
              setCachedFootprint(row.footprint as FootprintResult);
            setReady(true);
            return;
          }
        } catch {
          // DB nicht erreichbar -> zurueck zum Portfolio
        }
        if (!cancelled) router.replace("/portfolio");
        return;
      }
      const p = loadAnalysis();
      if (!p) {
        router.replace("/");
        return;
      }
      setBuilding(p.normalized);
      setReady(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [buildingId, router]);

  // Overrides & Massnahmen-Auswahl (debounced) in die DB zurueckschreiben.
  React.useEffect(() => {
    if (!buildingId || !building || !ready) return;
    // Ersten Durchlauf (initiales Laden aus der DB) ueberspringen
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/buildings/${buildingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalized: building, selectedMeasures: selected }),
      }).catch(() => {
        // Speichern best effort – UI bleibt nutzbar
      });
    }, 800);
    return () => clearTimeout(t);
  }, [buildingId, building, selected, ready]);

  const patchBuilding = React.useCallback(
    (patch: Partial<NormalizedBuilding>) => {
      setBuilding((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        const energyTouched =
          "heatKwhM2a" in patch ||
          "electricityKwhM2a" in patch ||
          "heatCarrier" in patch;
        if (energyTouched) {
          next.perCarrier = simplePerCarrier(
            next.heatCarrier,
            next.heatKwhM2a,
            next.electricityKwhM2a,
          );
          next.totalKwhM2a = next.heatKwhM2a + next.electricityKwhM2a;
        }
        return next;
      });
    },
    [],
  );

  const toggleMeasure = React.useCallback((id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const applyPackage = React.useCallback((measureIds: string[]) => {
    setSelected(measureIds);
  }, []);

  return {
    building,
    ready,
    selected,
    cachedRisk,
    cachedFacade,
    cachedFootprint,
    patchBuilding,
    setBuilding,
    toggleMeasure,
    applyPackage,
  };
}
