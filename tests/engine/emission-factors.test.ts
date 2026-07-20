import { describe, expect, it } from "vitest";
import { co2IntensityForYear, gridEfForYear } from "@/lib/engine/co2";
import { CRREM_EF_2020, GEG_ANLAGE9_EF } from "@/lib/data/emission-factors";
import type { EnergyState } from "@/lib/engine/types";

const gas = (heat: number): EnergyState => ({
  heatKwhM2a: heat,
  electricityKwhM2a: 0,
  perCarrier: [
    { carrier: "erdgas", label: "Erdgas", heatKwhM2a: heat, electricityKwhM2a: 0 },
  ],
});

const fw = (heat: number): EnergyState => ({
  heatKwhM2a: heat,
  electricityKwhM2a: 0,
  perCarrier: [
    {
      carrier: "fernwaerme_fossil",
      label: "Fernwärme",
      heatKwhM2a: heat,
      electricityKwhM2a: 0,
    },
  ],
});

describe("EF-Datenbank-Umschaltung (GAP-8, Spez. 2.5)", () => {
  it("CRREM-Welt: Erdgas 0,183 konstant über die Zeit (Regel 1)", () => {
    expect(CRREM_EF_2020.erdgas).toBe(0.183);
    const i2020 = co2IntensityForYear(gas(100), 2020, { database: "crrem" });
    const i2050 = co2IntensityForYear(gas(100), 2050, { database: "crrem" });
    expect(i2020).toBeCloseTo(18.3, 5);
    expect(i2050).toBeCloseTo(18.3, 5); // Direktverbrennung bleibt konstant
  });

  it("CRREM-Welt: Fernwärme sinkt proportional zum Netzpfad (netzgebunden)", () => {
    const i2020 = co2IntensityForYear(fw(100), 2020, { database: "crrem" });
    const i2050 = co2IntensityForYear(fw(100), 2050, { database: "crrem" });
    expect(i2020).toBeCloseTo(29.7, 5);
    expect(i2050).toBeLessThan(i2020);
    const ratio = gridEfForYear(2050) / gridEfForYear(2020);
    expect(i2050 / i2020).toBeCloseTo(ratio, 5);
  });

  it("GEG-Welt: Anlage-9-Faktoren, zeitkonstant (Erdgas 0,24, Strom 0,56)", () => {
    expect(GEG_ANLAGE9_EF.erdgas).toBe(0.24);
    expect(GEG_ANLAGE9_EF.strom_netz).toBe(0.56);
    const i2020 = co2IntensityForYear(gas(100), 2020, { database: "geg" });
    const i2050 = co2IntensityForYear(gas(100), 2050, { database: "geg" });
    expect(i2020).toBeCloseTo(24, 5);
    expect(i2050).toBeCloseTo(24, 5);
  });

  it("Umschaltung ändert das Ergebnis (CRREM ≠ GEG)", () => {
    const crrem = co2IntensityForYear(gas(100), 2024, { database: "crrem" });
    const geg = co2IntensityForYear(gas(100), 2024, { database: "geg" });
    expect(crrem).not.toBeCloseTo(geg, 2);
  });

  it("PV/Grünstrom: EF 0 (Regel 4)", () => {
    const state: EnergyState = {
      heatKwhM2a: 0,
      electricityKwhM2a: 50,
      perCarrier: [
        {
          carrier: "strom_gruen",
          label: "Grünstrom",
          heatKwhM2a: 0,
          electricityKwhM2a: 50,
        },
      ],
    };
    expect(co2IntensityForYear(state, 2024, { database: "crrem" })).toBe(0);
    expect(co2IntensityForYear(state, 2024, { database: "geg" })).toBe(0);
  });

  it("Lieferanten-Zeitreihe hat Vorrang und wird interpoliert (Regel 3)", () => {
    const supplierEf = { erdgas: { 2020: 0.2, 2030: 0.1, 2050: 0.05 } };
    const i2025 = co2IntensityForYear(gas(100), 2025, {
      database: "crrem",
      supplierEf,
    });
    // 2025 linear zwischen 0,2 und 0,1 -> 0,15
    expect(i2025).toBeCloseTo(15, 5);
    const i2060 = co2IntensityForYear(gas(100), 2060, {
      database: "crrem",
      supplierEf,
    });
    expect(i2060).toBeCloseTo(5, 5); // Randwert konstant fortgeschrieben
  });
});
