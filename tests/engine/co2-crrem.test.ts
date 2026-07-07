import { describe, expect, it } from "vitest";
import { getDemo } from "@/lib/demo";
import { analyzeBase, baseEnergyState, BASE_YEAR, YEAR_END } from "@/lib/engine";
import { co2IntensityForYear } from "@/lib/engine/co2";
import { computeCrrem } from "@/lib/engine/crrem";

const { normalized: demo } = getDemo();

describe("co2", () => {
  it("berechnet eine positive CO2-Intensität für den Demo-Datensatz", () => {
    const state = baseEnergyState(demo);
    const intensity = co2IntensityForYear(state, BASE_YEAR);
    expect(intensity).toBeGreaterThan(0);
    // Erdgas 61 kWh × 0,201 + Strom 24 kWh × Netz-EF (< 0,38) -> grober Korridor
    expect(intensity).toBeGreaterThan(10);
    expect(intensity).toBeLessThan(30);
  });

  it("nutzt den THG-Ausweiswert in der Basisanalyse (useCertificateCo2)", () => {
    const base = analyzeBase(demo);
    expect(base.co2.fromCertificate).toBe(true);
    expect(base.co2.intensityKgM2a).toBe(28);
    // Absolutwert: 28 kg/m² × 6971 m² / 1000
    expect(base.co2.tonnesPerYear).toBeCloseTo((28 * 6971) / 1000, 5);
  });
});

describe("crrem", () => {
  it("liefert eine Serie von BASE_YEAR bis 2050 mit konsistentem Stranding", () => {
    const state = baseEnergyState(demo);
    const crrem = computeCrrem(state, demo.crremType);

    expect(crrem.series[0].year).toBe(BASE_YEAR);
    expect(crrem.series[crrem.series.length - 1].year).toBe(YEAR_END);
    expect(crrem.series.length).toBe(YEAR_END - BASE_YEAR + 1);

    if (crrem.strandingYear != null) {
      // Im Stranding-Jahr liegt das Gebaeude ueber dem Pfad, davor nicht.
      const at = crrem.series.find((p) => p.year === crrem.strandingYear)!;
      expect(at.gebaeude).toBeGreaterThan(at.pfad);
      for (const p of crrem.series) {
        if (p.year < crrem.strandingYear) {
          expect(p.gebaeude).toBeLessThanOrEqual(p.pfad);
        }
      }
    }
  });

  it("der CRREM-Zielpfad fällt monoton (1,5-°C-Dekarbonisierung)", () => {
    const state = baseEnergyState(demo);
    const { series } = computeCrrem(state, demo.crremType);
    for (let i = 1; i < series.length; i++) {
      expect(series[i].pfad).toBeLessThanOrEqual(series[i - 1].pfad);
    }
  });
});
