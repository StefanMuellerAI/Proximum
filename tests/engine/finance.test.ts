import { describe, expect, it } from "vitest";
import {
  avoidanceCost,
  dynamicPayback,
  escalatedPrice,
  packageLifetimeYears,
  ENERGY_PRICE_ESCALATION,
  PREBOUND_FACTOR_LOW,
} from "@/lib/engine/finance";
import { analyzeScenario } from "@/lib/engine";
import { getDemo } from "@/lib/demo";
import type { EnergyState } from "@/lib/engine/types";
import { BASE_YEAR } from "@/lib/engine/types";

const gas = (heat: number): EnergyState => ({
  heatKwhM2a: heat,
  electricityKwhM2a: 0,
  perCarrier: [
    { carrier: "erdgas", label: "Erdgas", heatKwhM2a: heat, electricityKwhM2a: 0 },
  ],
});

describe("CO2-Vermeidungskosten (Spez. 2.8 + 1.4b)", () => {
  it("rechnet mit Lebensdauer im Nenner", () => {
    const result = avoidanceCost(100_000, 10, 20);
    // 100.000 € / (10 t/a × 20 a) = 500 €/t
    expect(result.eurPerTonneLifetime).toBe(500);
    // Predium-kompatibler Jahreswert: 10.000 €/(t·a)
    expect(result.eurPerTonneAnnual).toBe(10_000);
  });

  it("0-Einsparung → N/A (null)", () => {
    const result = avoidanceCost(100_000, 0, 20);
    expect(result.eurPerTonneLifetime).toBeNull();
    expect(result.eurPerTonneAnnual).toBeNull();
  });

  it("gewichtete Paket-Lebensdauer (invest-anteilig)", () => {
    const life = packageLifetimeYears([
      { id: "fassade", costPerM2: 150 }, // 40 a
      { id: "led", costPerM2: 25 }, // 15 a
    ]);
    expect(life).toBeGreaterThan(30);
    expect(life).toBeLessThan(40);
  });
});

describe("Dynamische Amortisation (Spez. 2.8)", () => {
  it("Energiepreis eskaliert mit 1,02^t", () => {
    expect(escalatedPrice(0.1, BASE_YEAR)).toBeCloseTo(0.1, 10);
    expect(escalatedPrice(0.1, BASE_YEAR + 10)).toBeCloseTo(
      0.1 * ENERGY_PRICE_ESCALATION ** 10,
      10,
    );
  });

  it("dynamische Amortisation ist kürzer als statische (steigende Preise)", () => {
    const baseState = gas(200);
    const scenState = gas(100);
    const area = 1000;
    // Statisch: Einsparung Jahr 1 ≈ 100 kWh/m² × 0,11 €/kWh × 1000 m² +
    // CO2-Ersparnis; Invest so, dass Amortisation ~15 Jahre statisch
    const firstYear = dynamicPayback(baseState, scenState, 1, area).firstYearSavingsEur!;
    const invest = firstYear * 15;
    const dyn = dynamicPayback(baseState, scenState, invest, area);
    expect(dyn.paybackYears).not.toBeNull();
    expect(dyn.paybackYears!).toBeLessThan(15);
  });

  it("keine Einsparung → keine Amortisation", () => {
    const state = gas(150);
    const result = dynamicPayback(state, state, 10_000, 1000);
    expect(result.paybackYears).toBeNull();
  });

  it("Prebound-Bandbreite: korrigierte Amortisation ist länger", () => {
    const baseState = gas(200);
    const scenState = gas(100);
    const invest = 80_000;
    const result = dynamicPayback(baseState, scenState, invest, 1000, {
      demandBased: true,
    });
    expect(result.paybackYearsPrebound).not.toBeNull();
    expect(result.firstYearSavingsPreboundEur!).toBeLessThan(
      result.firstYearSavingsEur!,
    );
    expect(result.paybackYearsPrebound!).toBeGreaterThanOrEqual(
      result.paybackYears!,
    );
  });

  it(`Prebound-Faktor ist dokumentiert (${PREBOUND_FACTOR_LOW})`, () => {
    expect(PREBOUND_FACTOR_LOW).toBeGreaterThan(0.5);
    expect(PREBOUND_FACTOR_LOW).toBeLessThan(1);
  });
});

describe("Integration analyzeScenario", () => {
  it("liefert Finanz-KPIs im Szenario-Ergebnis", () => {
    const demo = getDemo();
    const scen = analyzeScenario(demo.normalized, ["fassade", "waermepumpe"]);
    expect(scen.finance.avoidance.lifetimeYears).toBeGreaterThan(0);
    if (scen.investment.netInvestEur != null) {
      expect(scen.finance.dynamic.firstYearSavingsEur).not.toBeNull();
    }
  });
});
