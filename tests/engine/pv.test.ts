import { describe, expect, it } from "vitest";
import {
  peakPowerKwp,
  pvMonthlyYield,
  dinPvYieldPerM2Ref,
  existingPvOffsetKwhPerM2,
  effectivePvYieldKwhPerM2,
  MODULE_WP_PER_M2,
} from "@/lib/engine/pv";

describe("PV nach DIN V 18599-9 (GAP-9)", () => {
  it("P_pk = K_pk × A × 0,9 ohne Herstellerangabe", () => {
    // Mono 154 Wp/m² × 100 m² × 0,9 = 13,86 kWp
    expect(peakPowerKwp({ areaM2: 100, moduleType: "mono" })).toBeCloseTo(13.86, 5);
    // Herstellerangabe hat Vorrang
    expect(
      peakPowerKwp({ areaM2: 100, moduleType: "mono", peakPowerKwp: 12 }),
    ).toBe(12);
  });

  it("Modulleistungen laut Spezifikation (Mono 154, Poly 143, HE 200, CIS 125)", () => {
    expect(MODULE_WP_PER_M2).toEqual({
      mono: 154,
      poly: 143,
      hocheffizienz: 200,
      cis: 125,
    });
  });

  it("Monatsbilanz: 12 Monate, Sommer > Winter, plausibler Jahresertrag", () => {
    const result = pvMonthlyYield({ areaM2: 100, moduleType: "mono" });
    expect(result.monthlyKwh).toHaveLength(12);
    expect(result.monthlyKwh[6]).toBeGreaterThan(result.monthlyKwh[0]); // Juli > Januar
    // ~14 kWp Süd: grob 800-1.100 kWh/kWp·a
    const perKwp = result.annualKwh / peakPowerKwp({ areaM2: 100, moduleType: "mono" });
    expect(perKwp).toBeGreaterThan(650);
    expect(perKwp).toBeLessThan(1200);
  });

  it("Flachdach ohne Angabe → Süd (Faktor 1,0); Nord deutlich schlechter", () => {
    const sued = pvMonthlyYield({ areaM2: 50, moduleType: "mono" }).annualKwh;
    const nord = pvMonthlyYield({
      areaM2: 50,
      moduleType: "mono",
      orientation: "nord",
    }).annualKwh;
    expect(nord).toBeLessThan(sued * 0.7);
  });

  it("Ertrag je m² Bezugsfläche (80 % Dachbelegung)", () => {
    const perM2 = dinPvYieldPerM2Ref(400, 1200);
    expect(perM2).toBeGreaterThan(5);
    expect(perM2).toBeLessThan(60);
  });

  it("Verbrauchsausweis-Sonderlogik: keine doppelte Anrechnung", () => {
    expect(existingPvOffsetKwhPerM2(10000, 1000, false)).toBeCloseTo(10, 5);
    // Ausweis-Strom bereits PV-gemindert → kein weiterer Abzug
    expect(existingPvOffsetKwhPerM2(10000, 1000, true)).toBe(0);
  });

  it("effektiver Ertrag: Solar-API/manuell vorrangig, Typologie über DIN", () => {
    const solar = effectivePvYieldKwhPerM2({
      pvYieldKwhPerM2: 33,
      pvSource: "solar",
      bezugsflaecheM2: 1000,
      gebaeudetyp: "Wohngebäude",
    });
    expect(solar).toBe(33);
    const typologie = effectivePvYieldKwhPerM2({
      pvYieldKwhPerM2: 20,
      pvSource: "typologie",
      bezugsflaecheM2: 1000,
      gebaeudetyp: "Wohngebäude",
    });
    expect(typologie).not.toBe(20); // DIN-Monatsbilanz statt Pauschale
    expect(typologie).toBeGreaterThan(0);
  });
});
