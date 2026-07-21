import { describe, expect, it } from "vitest";
import { getDemo } from "@/lib/demo";
import { baseEnergyState } from "@/lib/engine";
import { applyMeasures, summarizeInvestment } from "@/lib/engine/renovation";
import { RENOVATION_MEASURES } from "@/lib/data/reference";

const { normalized: demo } = getDemo();

describe("applyMeasures", () => {
  it("ohne Massnahmen bleibt der Zustand unverändert", () => {
    const base = baseEnergyState(demo);
    const out = applyMeasures(base, []);
    expect(out.heatKwhM2a).toBeCloseTo(base.heatKwhM2a, 6);
    expect(out.electricityKwhM2a).toBeCloseTo(base.electricityKwhM2a, 6);
  });

  it("Wärmepumpe: Wärme wird zu Strom mit Faktor 0,28 (JAZ ~3,5)", () => {
    const base = baseEnergyState(demo);
    const out = applyMeasures(base, ["waermepumpe"]);
    expect(out.heatKwhM2a).toBeCloseTo(0, 6);
    expect(out.electricityKwhM2a).toBeCloseTo(
      base.electricityKwhM2a + base.heatKwhM2a * 0.28,
      6,
    );
  });

  it("PV reduziert den Netzstrom um den Gebäude-PV-Ertrag", () => {
    const base = baseEnergyState(demo);
    const pvYield = 10;
    const out = applyMeasures(base, ["pv"], undefined, pvYield);
    expect(out.electricityKwhM2a).toBeCloseTo(
      Math.max(0, base.electricityKwhM2a - pvYield),
      6,
    );
    expect(out.heatKwhM2a).toBeCloseTo(base.heatKwhM2a, 6);
  });

  it("LED senkt den Strom um 35 % (ohne WWR-Kontext)", () => {
    const base = baseEnergyState(demo);
    const out = applyMeasures(base, ["led"]);
    expect(out.electricityKwhM2a).toBeCloseTo(
      base.electricityKwhM2a * 0.65,
      6,
    );
  });

  it("Grünstrom: Netzstrom wird 1:1 zu Grünstrom, Endenergie unverändert", () => {
    const base = baseEnergyState(demo);
    const out = applyMeasures(base, ["gruenstrom"]);
    expect(out.heatKwhM2a).toBeCloseTo(base.heatKwhM2a, 6);
    expect(out.electricityKwhM2a).toBeCloseTo(base.electricityKwhM2a, 6);
    expect(out.perCarrier.some((s) => s.carrier === "strom_netz")).toBe(false);
    const gruen = out.perCarrier.find((s) => s.carrier === "strom_gruen");
    expect(gruen?.electricityKwhM2a).toBeCloseTo(base.electricityKwhM2a, 6);
  });

  it("Grünes Gas: Erdgas wird 1:1 zu Biomethan, Wärme unverändert", () => {
    const base = baseEnergyState(demo);
    const out = applyMeasures(base, ["gruengas"]);
    expect(out.heatKwhM2a).toBeCloseTo(base.heatKwhM2a, 6);
    expect(out.perCarrier.some((s) => s.carrier === "erdgas")).toBe(false);
    const bio = out.perCarrier.find((s) => s.carrier === "biomethan");
    expect(bio?.heatKwhM2a).toBeCloseTo(base.heatKwhM2a, 6);
  });

  it("Grünes Gas nach Wärmepumpe: kein Erdgas mehr vorhanden, Umstellung läuft ins Leere", () => {
    const base = baseEnergyState(demo);
    const out = applyMeasures(base, ["waermepumpe", "gruengas"]);
    expect(out.perCarrier.some((s) => s.carrier === "biomethan")).toBe(false);
    expect(out.heatKwhM2a).toBeCloseTo(0, 6);
  });

  it("Tarifumstellungen kosten den Eigentümer nichts", () => {
    const sum = summarizeInvestment(["gruenstrom", "gruengas"], 1000);
    expect(sum.totalInvestEur).toBeCloseTo(0, 6);
    expect(sum.netInvestEur).toBeCloseTo(0, 6);
  });

  it("Reduktionen wirken kumulativ multiplikativ", () => {
    const base = baseEnergyState(demo);
    const single = applyMeasures(base, ["abgleich"]);
    const double = applyMeasures(base, ["abgleich", "lueftung"]);
    // abgleich (8 %) und lueftung (10 %) -> 0,92 × 0,90
    expect(single.heatKwhM2a).toBeCloseTo(base.heatKwhM2a * 0.92, 6);
    expect(double.heatKwhM2a).toBeCloseTo(base.heatKwhM2a * 0.92 * 0.9, 6);
  });
});

describe("summarizeInvestment", () => {
  it("summiert Kosten und Förderung korrekt", () => {
    const ids = ["abgleich", "led"];
    const measures = RENOVATION_MEASURES.filter((m) => ids.includes(m.id));
    const investPerM2 = measures.reduce((s, m) => s + m.costPerM2, 0);
    const subsidyPerM2 = measures.reduce(
      (s, m) => s + m.costPerM2 * m.subsidyRate,
      0,
    );

    const area = 1000;
    const sum = summarizeInvestment(ids, area);
    expect(sum.investPerM2).toBeCloseTo(investPerM2, 6);
    expect(sum.totalInvestEur).toBeCloseTo(investPerM2 * area, 4);
    expect(sum.totalSubsidyEur).toBeCloseTo(subsidyPerM2 * area, 4);
    expect(sum.netInvestEur).toBeCloseTo((investPerM2 - subsidyPerM2) * area, 4);
  });

  it("ohne Fläche keine Absolutwerte", () => {
    const sum = summarizeInvestment(["led"], null);
    expect(sum.totalInvestEur).toBeNull();
    expect(sum.netInvestEur).toBeNull();
    expect(sum.investPerM2).toBeGreaterThan(0);
  });
});
