import { describe, expect, it } from "vitest";
import { estimateStockPercentile } from "@/lib/engine/taxonomy";
import { TAXONOMY_PED_TOP15 } from "@/lib/data/reference";

describe("estimateStockPercentile", () => {
  const top15 = TAXONOMY_PED_TOP15.OFF;

  it("trifft die dokumentierten Anker", () => {
    // Genau auf der Top-15%-Schwelle -> 15 %
    expect(estimateStockPercentile(top15, "OFF")).toBe(15);
    // Median-Anker (1,8x) -> 50 %
    expect(estimateStockPercentile(top15 * 1.8, "OFF")).toBe(50);
    // p85-Anker (3,2x) -> 85 %
    expect(estimateStockPercentile(top15 * 3.2, "OFF")).toBe(85);
  });

  it("klemmt an den Raendern auf 1..99 %", () => {
    expect(estimateStockPercentile(top15 * 0.1, "OFF")).toBe(1);
    expect(estimateStockPercentile(top15 * 10, "OFF")).toBe(99);
  });

  it("ist monoton: mehr Primärenergie -> schlechteres Perzentil", () => {
    let prev = 0;
    for (const factor of [0.5, 1, 1.5, 2, 2.8, 3.5, 5]) {
      const p = estimateStockPercentile(top15 * factor, "OFF")!;
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it("ohne Primärenergiewert null", () => {
    expect(estimateStockPercentile(null, "OFF")).toBeNull();
    expect(estimateStockPercentile(0, "OFF")).toBeNull();
  });

  it("nutzt die nutzungsspezifische Schwelle", () => {
    // 100 kWh: bei OFF (Schwelle 90) schlechter eingestuft als bei HEC (160)
    const off = estimateStockPercentile(100, "OFF")!;
    const hec = estimateStockPercentile(100, "HEC")!;
    expect(off).toBeGreaterThan(hec);
  });
});
