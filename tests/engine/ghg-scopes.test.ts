import { describe, expect, it } from "vitest";
import { computeGhgScopes } from "@/lib/engine/ghg-scopes";
import {
  householdElectricityDefault,
  withHouseholdElectricity,
} from "@/lib/engine/household-electricity";
import type { EnergyState } from "@/lib/engine/types";

const mixed: EnergyState = {
  heatKwhM2a: 120,
  electricityKwhM2a: 40,
  perCarrier: [
    { carrier: "erdgas", label: "Erdgas", heatKwhM2a: 120, electricityKwhM2a: 0 },
    { carrier: "strom_netz", label: "Strom", heatKwhM2a: 0, electricityKwhM2a: 40 },
  ],
};

describe("Scope 1/2/3 (GAP-12, Spez. 2.11)", () => {
  it("whole_building: S1 = Verbrennung, S2 = Einkauf, S3 = 0", () => {
    const r = computeGhgScopes({
      state: mixed,
      areaM2: 1000,
      perspective: "whole_building",
    });
    // S1: 120 × 0,24 = 28,8 kg/m²a; S2: 40 × 0,56 = 22,4 kg/m²a
    expect(r.scope1KgM2a).toBeCloseTo(28.8, 5);
    expect(r.scope2KgM2a).toBeCloseTo(22.4, 5);
    expect(r.scope3KgM2a).toBe(0);
    expect(r.totalTonnesPerYear).toBeCloseTo(51.2, 5);
  });

  it("vermieter: S1/S2 = Allgemeinflächen, S3 = Mietflächen", () => {
    const r = computeGhgScopes({
      state: mixed,
      areaM2: 1000,
      rentalShare: 0.9,
      perspective: "vermieter",
    });
    expect(r.scope1KgM2a).toBeCloseTo(28.8 * 0.1, 5);
    expect(r.scope2KgM2a).toBeCloseTo(22.4 * 0.1, 5);
    expect(r.scope3KgM2a).toBeCloseTo(51.2 * 0.9, 5);
  });

  it("mieter ist spiegelbildlich zum Vermieter", () => {
    const v = computeGhgScopes({
      state: mixed,
      areaM2: 1000,
      rentalShare: 0.9,
      perspective: "vermieter",
    });
    const m = computeGhgScopes({
      state: mixed,
      areaM2: 1000,
      rentalShare: 0.9,
      perspective: "mieter",
    });
    expect(m.scope1KgM2a).toBeCloseTo(28.8 * 0.9, 5);
    expect(m.scope3KgM2a).toBeCloseTo(v.scope1KgM2a + v.scope2KgM2a, 5);
    // Summe aller Scopes ist perspektivenunabhängig
    expect(
      m.scope1KgM2a + m.scope2KgM2a + m.scope3KgM2a,
    ).toBeCloseTo(v.scope1KgM2a + v.scope2KgM2a + v.scope3KgM2a, 5);
  });
});

describe("Haushaltsstrom-Default WG (GAP-15)", () => {
  it("ergänzt nur bei WG ohne erfassten Strom", () => {
    expect(
      householdElectricityDefault({
        gebaeudetyp: "Wohngebäude",
        crremType: "RMF",
        electricityKwhM2a: 0,
      }),
    ).toBe(25);
    expect(
      householdElectricityDefault({
        gebaeudetyp: "Wohngebäude",
        crremType: "RSF",
        electricityKwhM2a: 0,
      }),
    ).toBe(30);
    // Strom bereits erfasst → kein Zuschlag
    expect(
      householdElectricityDefault({
        gebaeudetyp: "Wohngebäude",
        crremType: "RMF",
        electricityKwhM2a: 20,
      }),
    ).toBe(0);
    // NWG → kein Zuschlag
    expect(
      householdElectricityDefault({
        gebaeudetyp: "Nichtwohngebäude",
        crremType: "OFF",
        electricityKwhM2a: 0,
      }),
    ).toBe(0);
  });

  it("weist den Zuschlag im Zustand AUS (sichtbarer Default statt Lücke)", () => {
    const wg: EnergyState = {
      heatKwhM2a: 120,
      electricityKwhM2a: 0,
      perCarrier: [
        { carrier: "erdgas", label: "Erdgas", heatKwhM2a: 120, electricityKwhM2a: 0 },
      ],
    };
    const { state, addedKwhM2a } = withHouseholdElectricity(wg, {
      gebaeudetyp: "Wohngebäude",
      crremType: "RMF",
      electricityKwhM2a: 0,
    });
    expect(addedKwhM2a).toBe(25);
    expect(state.electricityKwhM2a).toBe(25);
    expect(
      state.perCarrier.some((s) => s.label.includes("Haushaltsstrom-Default")),
    ).toBe(true);
    // Original bleibt unveraendert (pure)
    expect(wg.electricityKwhM2a).toBe(0);
  });
});
