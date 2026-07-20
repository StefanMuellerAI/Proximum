import { describe, expect, it } from "vitest";
import {
  uValue,
  layerResistance,
  SURFACE_RESISTANCES,
} from "@/lib/engine/thermal/u-value";
import {
  buildThermalModel,
  heatBalance,
  calibrate,
  measureHeatReduction,
  componentU,
  CALIBRATION_TOLERANCE,
} from "@/lib/engine/thermal/model";
import { ageClassDefaults } from "@/lib/engine/thermal/tabula";
import { analyzeThermal } from "@/lib/engine/thermal";
import { analyzeScenario } from "@/lib/engine";
import { getDemo } from "@/lib/demo";

describe("U-Wert-Engine (DIN EN ISO 6946, Abnahme 4.6)", () => {
  it("Wand d=0,36 λ=0,8 + Dämmung d=0,12 λ=0,035 → U ≈ 0,25 W/m²K", () => {
    // Handrechnung: R = 0,13 + 0,36/0,8 + 0,12/0,035 + 0,04
    //             = 0,13 + 0,45 + 3,4286 + 0,04 = 4,0486 m²K/W
    // U = 1 / 4,0486 = 0,247 W/m²K
    const u = uValue(
      "wand",
      { thicknessM: 0.36, lambdaWmK: 0.8 },
      { thicknessM: 0.12, lambdaWmK: 0.035 },
    );
    expect(u).toBeCloseTo(0.247, 2);
    expect(Math.abs(u - 0.25)).toBeLessThan(0.01);
  });

  it("R = d / λ", () => {
    expect(layerResistance({ thicknessM: 0.1, lambdaWmK: 0.04 })).toBeCloseTo(2.5, 10);
  });

  it("Rsi/Rse-Normwerte nach Bauteillage", () => {
    expect(SURFACE_RESISTANCES.wand).toEqual({ rsi: 0.13, rse: 0.04 });
    expect(SURFACE_RESISTANCES.dach.rsi).toBe(0.1);
  });

  it("Dämmung ersetzt Bestand: mehr Dämmung → kleinerer U-Wert", () => {
    const base = { thicknessM: 0.3, lambdaWmK: 0.5 };
    const u0 = uValue("wand", base, null);
    const u1 = uValue("wand", base, { thicknessM: 0.08, lambdaWmK: 0.035 });
    const u2 = uValue("wand", base, { thicknessM: 0.16, lambdaWmK: 0.035 });
    expect(u1).toBeLessThan(u0);
    expect(u2).toBeLessThan(u1);
  });
});

describe("TABULA-Anreicherung", () => {
  it("liefert baujahresabhängige Defaults (alt schlechter als neu)", () => {
    const alt = ageClassDefaults(1900);
    const neu = ageClassDefaults(2020);
    const uAlt = uValue("wand", alt.wall, null);
    const uNeu = uValue("wand", neu.wall, null);
    expect(uAlt).toBeGreaterThan(1.2);
    expect(uNeu).toBeLessThan(0.3);
    expect(alt.windowU).toBeGreaterThan(neu.windowU);
  });
});

describe("Heizperiodenbilanz (EN ISO 13790)", () => {
  const model = buildThermalModel({
    gebaeudetyp: "Wohngebäude",
    baujahr: 1965,
    bezugsflaecheM2: 1000,
    wwrPercent: 25,
    heatCarrier: "erdgas",
  });

  it("liefert plausible Endenergie für ein unsaniertes 60er-Jahre-MFH", () => {
    const result = heatBalance(model);
    // Typischer Bestand: 100-250 kWh/m²a
    expect(result.qFinalKwhM2a).toBeGreaterThan(80);
    expect(result.qFinalKwhM2a).toBeLessThan(300);
    expect(result.qTransmissionKwhM2a).toBeGreaterThan(result.qVentilationKwhM2a);
  });

  it("Q_H,nd = Q_ht − η·Q_gn ist nie negativ", () => {
    const passive = buildThermalModel({
      gebaeudetyp: "Wohngebäude",
      baujahr: 2022,
      bezugsflaecheM2: 200,
      wwrPercent: 40,
      heatCarrier: "waermepumpe",
    });
    expect(heatBalance(passive).qHndKwhM2a).toBeGreaterThanOrEqual(0);
  });
});

describe("Thermische Skalierung (Kalibrierung, Abnahme 4.5)", () => {
  it("konvergiert auf typische Ausweiswerte mit < 0,1 % Abweichung", () => {
    const targets = [90, 120, 150, 180, 220];
    for (const target of targets) {
      const model = buildThermalModel({
        gebaeudetyp: "Wohngebäude",
        baujahr: 1965,
        bezugsflaecheM2: 1200,
        wwrPercent: 25,
        heatCarrier: "erdgas",
      });
      const result = calibrate(model, target);
      expect(result.success).toBe(true);
      expect(Math.abs(result.deviation)).toBeLessThan(CALIBRATION_TOLERANCE);
      expect(
        Math.abs(heatBalance(result.model).qFinalKwhM2a - target) / target,
      ).toBeLessThan(CALIBRATION_TOLERANCE);
    }
  });

  it("Kalibrierungs-Protokoll macht Parameterverschiebungen sichtbar (2.13-11)", () => {
    const model = buildThermalModel({
      gebaeudetyp: "Wohngebäude",
      baujahr: 1965,
      bezugsflaecheM2: 1200,
      wwrPercent: 25,
      heatCarrier: "erdgas",
    });
    const result = calibrate(model, 120);
    expect(result.protocol.length).toBeGreaterThan(0);
    for (const step of result.protocol) {
      expect(step.label).toBeTruthy();
      expect(step.from).not.toBe(step.to);
    }
  });

  it("extreme Zielwerte scheitern kontrolliert (Maßnahmenplanung sperren)", () => {
    const model = buildThermalModel({
      gebaeudetyp: "Wohngebäude",
      baujahr: 1965,
      bezugsflaecheM2: 1200,
      wwrPercent: 25,
      heatCarrier: "erdgas",
    });
    // 5 kWh/m²a ist mit einem 60er-Bestand nicht darstellbar
    const result = calibrate(model, 5);
    expect(result.success).toBe(false);
  });
});

describe("Bauteilscharfe Maßnahmenwirkung", () => {
  it("Dämmung senkt Q_final; größere Bauteile wirken stärker", () => {
    const model = buildThermalModel({
      gebaeudetyp: "Wohngebäude",
      baujahr: 1965,
      bezugsflaecheM2: 1200,
      wwrPercent: 25,
      heatCarrier: "erdgas",
    });
    const calibrated = calibrate(model, 160).model;
    const wall = measureHeatReduction(calibrated, "wand", {
      insulation: { thicknessM: 0.16, lambdaWmK: 0.035 },
    });
    const window = measureHeatReduction(calibrated, "fenster", {
      windowU: 0.9,
    });
    expect(wall).toBeGreaterThan(0);
    expect(wall).toBeLessThan(0.6);
    expect(window).toBeGreaterThan(0);
    // Nach Sanierung ist der Wand-U-Wert klein
    const wand = calibrated.components.find((c) => c.type === "wand")!;
    expect(componentU({ ...wand, insulation: { thicknessM: 0.16, lambdaWmK: 0.035 } })).toBeLessThan(0.3);
  });

  it("Integration: analyzeScenario liefert Kalibrierungsstatus + Protokoll", () => {
    const demo = getDemo();
    const scen = analyzeScenario(demo.normalized, ["fassade"]);
    if (demo.normalized.bezugsflaecheM2 != null) {
      expect(scen.thermal).not.toBeNull();
      const thermal = analyzeThermal(demo.normalized);
      expect(thermal?.calibration.success).toBe(scen.thermal!.calibrated);
    }
  });
});
