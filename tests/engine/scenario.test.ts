import { describe, expect, it } from "vitest";
import {
  checkTargets,
  effectiveFromYear,
  evaluateScenario,
  evaluateScenarioBuilding,
  exclusionWeight,
  isValidPlanMeasureId,
} from "@/lib/engine/scenario";
import { BASE_YEAR, YEAR_END } from "@/lib/engine/types";
import { getDemo } from "@/lib/demo";

const demo = getDemo().normalized;

describe("Zeitanteiligkeit (2.13-10)", () => {
  it("Maßnahmenwirkung ab dem Folgejahr des Umsetzungsdatums", () => {
    expect(effectiveFromYear("2030-06-15")).toBe(2031);
    expect(effectiveFromYear("2030-12-31")).toBe(2031);
    expect(effectiveFromYear(null)).toBe(BASE_YEAR + 1);
  });

  it("Exklusion monatsanteilig (Auszug Ende März → 3/12)", () => {
    expect(exclusionWeight(2029, "2030-03-31")).toBe(1);
    expect(exclusionWeight(2030, "2030-03-31")).toBeCloseTo(3 / 12, 10);
    expect(exclusionWeight(2031, "2030-03-31")).toBe(0);
  });
});

describe("evaluateScenarioBuilding", () => {
  it("Maßnahme senkt die CO2-Intensität erst ab dem Wirkjahr", () => {
    const result = evaluateScenarioBuilding({
      id: "b1",
      name: "Test",
      normalized: demo,
      measures: [{ measureId: "waermepumpe", implementationDate: "2032-06-01" }],
    });
    const before = result.series.find((p) => p.year === 2032)!;
    const after = result.series.find((p) => p.year === 2033)!;
    expect(after.co2IntensityKgM2a).toBeLessThan(before.co2IntensityKgM2a);
  });

  it("Exklusion setzt das Gewicht ab dem Folgejahr auf 0", () => {
    const result = evaluateScenarioBuilding({
      id: "b1",
      name: "Test",
      normalized: demo,
      measures: [{ measureId: "exklusion", implementationDate: "2035-06-30" }],
    });
    expect(result.excludedFromYear).toBe(2035);
    expect(result.series.find((p) => p.year === 2034)!.weight).toBe(1);
    expect(result.series.find((p) => p.year === 2035)!.weight).toBeCloseTo(0.5, 10);
    expect(result.series.find((p) => p.year === 2036)!.weight).toBe(0);
  });
});

describe("evaluateScenario (Portfolio-Zeitverlauf)", () => {
  it("aggregiert Zeitverlauf, Investitionen und Stranding", () => {
    const evaluation = evaluateScenario([
      {
        id: "b1",
        name: "A",
        normalized: demo,
        measures: [{ measureId: "fassade", implementationDate: "2028-01-01" }],
      },
      {
        id: "b2",
        name: "B",
        normalized: demo,
        measures: [],
      },
    ]);
    expect(evaluation.timeline).toHaveLength(YEAR_END - BASE_YEAR + 1);
    expect(evaluation.buildings).toHaveLength(2);
    // Investition wird im Umsetzungsjahr 2028 verbucht
    const y2028 = evaluation.timeline.find((p) => p.year === 2028)!;
    expect(y2028.investEur).toBeGreaterThan(0);
    expect(evaluation.totalInvestEur).toBeGreaterThan(0);
    // Kumulierte Investitionen sind monoton
    for (let i = 1; i < evaluation.timeline.length; i++) {
      expect(evaluation.timeline[i].cumulativeInvestEur).toBeGreaterThanOrEqual(
        evaluation.timeline[i - 1].cumulativeInvestEur,
      );
    }
  });

  it("eigene Ziele werden gegen den Zeitverlauf geprüft (max. 5)", () => {
    const evaluation = evaluateScenario([
      { id: "b1", name: "A", normalized: demo, measures: [] },
    ]);
    const results = checkTargets(evaluation, [
      { kpi: "strandedCount", year: 2050, maxValue: 999 },
      { kpi: "cumulativeInvest", year: 2050, maxValue: 0 },
    ]);
    expect(results[0].met).toBe(true);
    expect(results[1].met).toBe(true); // keine Massnahmen -> 0 Invest
  });
});

describe("Plan-Validierung", () => {
  it("akzeptiert Katalog-IDs und Exklusion, lehnt Unbekanntes ab", () => {
    expect(isValidPlanMeasureId("fassade")).toBe(true);
    expect(isValidPlanMeasureId("exklusion")).toBe(true);
    expect(isValidPlanMeasureId("quatsch")).toBe(false);
  });
});
