import { describe, expect, it } from "vitest";
import {
  invalidationsFor,
  RECOMPUTE_DAG,
} from "@/lib/engine/recompute-dag";

describe("Recompute-DAG (2.13-3)", () => {
  it("Gebäudezustands-Änderung invalidiert die gesamte Kette", () => {
    const inv = invalidationsFor("building_state");
    const nodes = inv.map((i) => i.node);
    expect(nodes).toContain("thermal_scaling");
    expect(nodes).toContain("status_quo_kpis");
    expect(nodes).toContain("measure_plans");
    expect(nodes).toContain("scenario_aggregates");
    expect(nodes).toContain("portfolio_aggregates");
    // Eingefrorene Reports werden NIE automatisch invalidiert
    expect(nodes).not.toContain("report_snapshots");
  });

  it("Strukturbruch: Maßnahmenpläne mit delete_with_backup (Berechnungskonflikt)", () => {
    const inv = invalidationsFor("building_state");
    const plans = inv.find((i) => i.node === "measure_plans");
    expect(plans?.action).toBe("delete_with_backup");
  });

  it("KPI-Änderung: Pläne werden angepasst (adaptiv), nicht gelöscht", () => {
    const inv = invalidationsFor("status_quo_kpis");
    const plans = inv.find((i) => i.node === "measure_plans");
    expect(plans?.action).toBe("adapt");
  });

  it("Portfolio-Änderungen breiten sich nicht rückwärts aus", () => {
    expect(invalidationsFor("portfolio_aggregates")).toHaveLength(0);
  });

  it("DAG ist azyklisch", () => {
    // Tiefensuche: kein Knoten erreicht sich selbst
    const adj = new Map<string, string[]>();
    for (const e of RECOMPUTE_DAG) {
      adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    }
    const reaches = (start: string, target: string, seen = new Set<string>()): boolean => {
      for (const next of adj.get(start) ?? []) {
        if (next === target) return true;
        if (!seen.has(next)) {
          seen.add(next);
          if (reaches(next, target, seen)) return true;
        }
      }
      return false;
    };
    for (const node of adj.keys()) {
      expect(reaches(node, node)).toBe(false);
    }
  });
});
