import { describe, expect, it } from "vitest";
import { getDemo } from "@/lib/demo";
import { optimize } from "@/lib/engine/optimizer";
import { analyzeBase } from "@/lib/engine";
import { RENOVATION_MEASURES } from "@/lib/data/reference";

const { normalized: demo } = getDemo();

describe("optimize", () => {
  it("prüft alle 2^n−1 nicht-leeren Kombinationen des Katalogs", () => {
    const r = optimize(demo, { goal: "budget", budgetEur: null });
    expect(r.evaluatedCount).toBe(2 ** RENOVATION_MEASURES.length - 1);
    expect(r.ranking.length).toBeLessThanOrEqual(10);
  });

  it("Ziel Stranding: alle zulässigen Pakete vermeiden Stranding vor dem Zieljahr", () => {
    const r = optimize(demo, { goal: "stranding", targetYear: 2040 });
    for (const p of r.ranking.filter((p) => p.feasible)) {
      expect(p.strandingYear == null || p.strandingYear >= 2040).toBe(true);
    }
    if (r.best) {
      expect(r.best.feasible).toBe(true);
    }
  });

  it("Ziel Budget: zulässige Pakete respektieren das Limit", () => {
    const budget = 500_000;
    const r = optimize(demo, { goal: "budget", budgetEur: budget });
    for (const p of r.ranking.filter((p) => p.feasible)) {
      expect(p.netInvestEur).not.toBeNull();
      expect(p.netInvestEur!).toBeLessThanOrEqual(budget);
    }
  });

  it("Zielfunktion minInvest: bestes Paket ist das günstigste zulässige", () => {
    const r = optimize(demo, {
      goal: "stranding",
      targetYear: 2040,
      objective: "minInvest",
    });
    const feasible = r.ranking.filter((p) => p.feasible);
    for (let i = 1; i < feasible.length; i++) {
      expect(feasible[i - 1].netInvestEur! - 1e-6).toBeLessThanOrEqual(
        feasible[i].netInvestEur!,
      );
    }
  });

  it("Roadmap: Jahre steigen streng monoton, Stranding verbessert sich nie", () => {
    const r = optimize(demo, { goal: "stranding", targetYear: 2045 });
    const base = analyzeBase(demo);
    let prevYear = 0;
    let prevStranding = base.crrem.strandingYear ?? 2051;
    for (const step of r.roadmap) {
      expect(step.year).toBeGreaterThan(prevYear);
      const after = step.strandingAfter ?? 2051;
      expect(after).toBeGreaterThanOrEqual(prevStranding);
      prevYear = step.year;
      prevStranding = after;
    }
    if (r.best) {
      expect(r.roadmap.length).toBe(r.best.measureIds.length);
    }
  });

  it("Basiswerte im Ergebnis stimmen mit analyzeBase überein", () => {
    const r = optimize(demo, { goal: "budget", budgetEur: null });
    const base = analyzeBase(demo);
    expect(r.baseStrandingYear).toBe(base.crrem.strandingYear);
    expect(r.baseTaxonomyAligned).toBe(base.taxonomy.aligned);
  });
});
