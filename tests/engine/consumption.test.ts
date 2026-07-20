import { describe, expect, it } from "vitest";
import {
  aggregateConsumption,
  dedupeHash,
  demandVsConsumption,
} from "@/lib/engine/consumption";

const rec = (
  start: string,
  end: string,
  year: number,
  kwh: number,
  carrier = "Erdgas",
) => ({
  periodStart: start,
  periodEnd: end,
  reportingYear: year,
  carrier,
  amountKwh: kwh,
});

describe("aggregateConsumption (GAP-7)", () => {
  it("aggregiert je Berichtsjahr und Träger", () => {
    const agg = aggregateConsumption([
      rec("2024-01-01", "2024-12-31", 2024, 120_000),
      rec("2024-01-01", "2024-12-31", 2024, 30_000, "Strom"),
      rec("2023-01-01", "2023-12-31", 2023, 110_000),
    ]);
    expect(agg).toHaveLength(2);
    const y2024 = agg.find((a) => a.reportingYear === 2024)!;
    expect(y2024.totalKwh).toBe(150_000);
    expect(y2024.byCarrier.erdgas).toBe(120_000);
    expect(y2024.byCarrier.strom_netz).toBe(30_000);
    expect(y2024.hasGap).toBe(false);
  });

  it("Gap-Analyse: unvollständige Jahre werden erkannt und hochgerechnet", () => {
    // Nur 6 Monate erfasst
    const agg = aggregateConsumption([
      rec("2024-01-01", "2024-06-30", 2024, 60_000),
    ]);
    expect(agg[0].hasGap).toBe(true);
    expect(agg[0].coveredMonths).toBeCloseTo(6, 0);
    // whole building approach: linear auf 12 Monate (±2 % Monatsnäherung)
    expect(agg[0].extrapolatedTotalKwh).toBeGreaterThan(117_000);
    expect(agg[0].extrapolatedTotalKwh).toBeLessThan(123_000);
  });

  it("verworfene Datensätze fließen nicht ein", () => {
    const agg = aggregateConsumption([
      { ...rec("2024-01-01", "2024-12-31", 2024, 100_000), reviewStatus: "verworfen" },
    ]);
    expect(agg).toHaveLength(0);
  });
});

describe("demandVsConsumption (1.4a)", () => {
  it("erkennt Prebound (Verbrauch deutlich unter Bedarf)", () => {
    const agg = aggregateConsumption([
      rec("2024-01-01", "2024-12-31", 2024, 70_000),
    ]);
    // Bedarf 100 kWh/m²a × 1000 m² = 100.000 kWh; Verbrauch 70.000 → 70 %
    const cmp = demandVsConsumption(agg, 100, 1000);
    expect(cmp).toHaveLength(1);
    expect(cmp[0].ratio).toBeCloseTo(0.7, 2);
    expect(cmp[0].assessment).toBe("verbrauch_deutlich_unter_bedarf");
  });

  it("konsistent bei ±20 %", () => {
    const agg = aggregateConsumption([
      rec("2024-01-01", "2024-12-31", 2024, 95_000),
    ]);
    expect(demandVsConsumption(agg, 100, 1000)[0].assessment).toBe("konsistent");
  });
});

describe("dedupeHash (Duplikat-/Storno-Erkennung)", () => {
  it("gleiche Rechnung → gleicher Hash; andere Menge → anderer Hash", () => {
    const a = dedupeHash(rec("2024-01-01", "2024-12-31", 2024, 120_000));
    const b = dedupeHash(rec("2024-01-01", "2024-12-31", 2024, 120_000));
    const c = dedupeHash(rec("2024-01-01", "2024-12-31", 2024, 90_000));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("Storno (negative Menge) hasht auf die Original-Rechnung", () => {
    const original = dedupeHash(rec("2024-01-01", "2024-12-31", 2024, 120_000));
    const storno = dedupeHash(rec("2024-01-01", "2024-12-31", 2024, -120_000));
    expect(storno).toBe(original);
  });
});
