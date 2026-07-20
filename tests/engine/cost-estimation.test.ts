import { describe, expect, it } from "vitest";
import {
  estimateMeasureCost,
  estimatePackageCost,
  hydraulicBalanceWithValvesEurPerM2,
  hydraulicBalanceWithoutValvesEurPerM2,
  VAT_FACTOR,
  ANCILLARY_FACTOR,
} from "@/lib/engine/cost-estimation";
import { bpiFactor, heatLoadKw } from "@/lib/data/cost-functions";
import { buildThermalModel } from "@/lib/engine/thermal/model";

const ctx = {
  ebfM2: 1200,
  gebaeudetyp: "Wohngebäude" as const,
  epcClass: "E",
};

describe("Faktorkette (Spez. 2.9)", () => {
  it("brutto = netto × 1,15 (BNK) × 1,19 (MwSt)", () => {
    const est = estimateMeasureCost("fassade", ctx)!;
    expect(est.grossEur).toBeCloseTo(est.netEur * ANCILLARY_FACTOR * VAT_FACTOR, 6);
    expect(est.isEstimate).toBe(true);
  });

  it("Regionalfaktor skaliert linear (Default 1,0)", () => {
    const base = estimateMeasureCost("fassade", ctx)!;
    const regional = estimateMeasureCost("fassade", { ...ctx, regionalFactor: 1.2 })!;
    expect(regional.netEur).toBeCloseTo(base.netEur * 1.2, 6);
  });

  it("BPI-Indexierung: Kosten_heute = Kosten_Preisstand × (BPI_heute/BPI_Preisstand)", () => {
    // Jagnow/Wolff-Formeln haben Preisstand 2001 → deutliche Indexierung
    expect(bpiFactor("2001", "2024-Q4")).toBeGreaterThan(1.8);
    expect(bpiFactor("2023", "2023")).toBe(1);
  });
});

describe("Mengenlogik", () => {
  it("Hülle: Bauteilfläche aus dem thermischen Modell (GAP-2)", () => {
    const model = buildThermalModel({
      gebaeudetyp: "Wohngebäude",
      baujahr: 1965,
      bezugsflaecheM2: 1200,
      wwrPercent: 25,
      heatCarrier: "erdgas",
    });
    const withModel = estimateMeasureCost("fassade", { ...ctx, thermalModel: model })!;
    const wallArea = model.components.find((c) => c.type === "wand")!.areaM2;
    expect(withModel.quantity).toBeCloseTo(wallArea, 6);
  });

  it("Wärmepumpe: Heizlast aus Effizienzklasse (2.13-9)", () => {
    // Klasse E: 80 W/m² × 1200 m² = 96 kW
    expect(heatLoadKw("E", 1200)).toBeCloseTo(96, 5);
    const est = estimateMeasureCost("waermepumpe", ctx)!;
    expect(est.quantity).toBeCloseTo(96, 5);
    expect(est.unit).toBe("kw_heizlast");
  });

  it("Lüftung dezentral: NWG Nutzfläche/100, MFH je WE", () => {
    const nwg = estimateMeasureCost("lueftung", {
      ...ctx,
      gebaeudetyp: "Nichtwohngebäude",
    })!;
    expect(nwg.quantity).toBe(12); // 1200/100
    const mfh = estimateMeasureCost("lueftung", { ...ctx, units: 16 })!;
    expect(mfh.quantity).toBe(16);
  });

  it("LED: installierte Lumen / 1.650", () => {
    const est = estimateMeasureCost("led", ctx)!;
    expect(est.quantity).toBeCloseTo((1200 * 500) / 1650, 5);
  });
});

describe("Sonderformeln (Predium-identisch)", () => {
  it("hydraulischer Abgleich: 10,41×EBF^-0,1998 bzw. 14,12×EBF^-0,1412", () => {
    expect(hydraulicBalanceWithoutValvesEurPerM2(1000)).toBeCloseTo(
      10.41 * 1000 ** -0.1998,
      6,
    );
    expect(hydraulicBalanceWithValvesEurPerM2(1000)).toBeCloseTo(
      14.12 * 1000 ** -0.1412,
      6,
    );
    // Groessendegression: spezifische Kosten sinken mit der Flaeche
    expect(hydraulicBalanceWithValvesEurPerM2(5000)).toBeLessThan(
      hydraulicBalanceWithValvesEurPerM2(500),
    );
  });

  it("Fernwärme: IWU-Exponent −0,487 (Größendegression)", () => {
    const small = estimateMeasureCost("fernwaerme", { ...ctx, ebfM2: 500 })!;
    const large = estimateMeasureCost("fernwaerme", { ...ctx, ebfM2: 5000 })!;
    expect(small.unitCostEur).toBeGreaterThan(large.unitCostEur);
  });
});

describe("Paket-Schätzung", () => {
  it("summiert netto/brutto konsistent und liefert plausible Größenordnung", () => {
    const pkg = estimatePackageCost(["fassade", "dach", "fenster"], ctx);
    expect(pkg.estimates).toHaveLength(3);
    expect(pkg.totalGrossEur).toBeCloseTo(
      pkg.totalNetEur * ANCILLARY_FACTOR * VAT_FACTOR,
      4,
    );
    // Vollsanierung Hülle 1200 m² MFH: sechsstellig, unter 1,5 Mio €
    expect(pkg.totalGrossEur).toBeGreaterThan(100_000);
    expect(pkg.totalGrossEur).toBeLessThan(1_500_000);
  });
});
