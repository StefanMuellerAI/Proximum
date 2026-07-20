import { describe, expect, it } from "vitest";
import {
  computeCo2CostSplit,
  vermieterAnteilWG,
  CO2KOSTAUFG_STUFEN_WG,
} from "@/lib/engine/co2-cost-split";
import { computeCo2Levy } from "@/lib/engine/co2levy";
import { co2PriceForYear, ebevCo2KgPerKwh } from "@/lib/data/reference";
import type { EnergyState } from "@/lib/engine/types";

const gasState = (heatKwhM2a: number): EnergyState => ({
  heatKwhM2a,
  electricityKwhM2a: 0,
  perCarrier: [
    {
      carrier: "erdgas",
      label: "Erdgas",
      heatKwhM2a,
      electricityKwhM2a: 0,
    },
  ],
});

describe("Abnahme 4.2: BEHG/EBeV-Preisprobe", () => {
  it("1.000 kWh Erdgas 2025 → 0,2016 t × 55 €/t = 11,09 € netto", () => {
    const tonnes = (1000 * ebevCo2KgPerKwh("erdgas")!) / 1000;
    expect(tonnes).toBeCloseTo(0.2016, 6);
    const eur = tonnes * co2PriceForYear(2025, "behg");
    expect(eur).toBeCloseTo(11.088, 3); // 11,09 €
  });

  it("Heizöl 17,44 € und Flüssiggas 15,62 € je 1.000 kWh (2025, brutto-nah)", () => {
    // Referenztabelle (Spez. 4.2): Heizöl 0,2664 t × 55 € = 14,65 € netto
    // → 17,44 € brutto (×1,19); Flüssiggas 0,2387 t × 55 € = 13,13 € netto
    // → 15,62 € brutto.
    const oel = ((1000 * ebevCo2KgPerKwh("heizoel")!) / 1000) * 55 * 1.19;
    const lpg = ((1000 * ebevCo2KgPerKwh("fluessiggas")!) / 1000) * 55 * 1.19;
    expect(oel).toBeCloseTo(17.44, 2);
    expect(lpg).toBeCloseTo(15.62, 2);
  });

  it("BEHG-Pfad: 2026 = 65 €/t, ab 2027 +6,50 €/t jährlich (Predium-Default)", () => {
    expect(co2PriceForYear(2026)).toBe(65);
    expect(co2PriceForYear(2027)).toBe(71.5);
    expect(co2PriceForYear(2030)).toBe(91);
    // Szenario-Pfad bleibt wählbar
    expect(co2PriceForYear(2030, "ets2_szenario")).toBe(120);
  });
});

describe("Abnahme 4.4: CO2KostAufG-Aufteilung", () => {
  it("WG mit 35 kg CO₂/m²a → Stufe 6, Vermieteranteil 50 %", () => {
    const { stufe, anteil } = vermieterAnteilWG(35);
    expect(stufe).toBe(6);
    expect(anteil).toBe(0.5);
  });

  it("NWG → 50/50", () => {
    const result = computeCo2CostSplit(gasState(150), "Nichtwohngebäude", 1000, 55);
    expect(result.vermieterAnteil).toBe(0.5);
    expect(result.mieterAnteil).toBe(0.5);
    expect(result.stufe).toBeNull();
  });

  it("alle 10 Stufengrenzen aus dem Gesetzestext", () => {
    // < 12 → 0 % · 12–<17 → 10 % · ... · ≥ 52 → 95 %
    expect(vermieterAnteilWG(11.9).anteil).toBe(0.0);
    expect(vermieterAnteilWG(12).anteil).toBe(0.1);
    expect(vermieterAnteilWG(16.9).anteil).toBe(0.1);
    expect(vermieterAnteilWG(17).anteil).toBe(0.2);
    expect(vermieterAnteilWG(22).anteil).toBe(0.3);
    expect(vermieterAnteilWG(27).anteil).toBe(0.4);
    expect(vermieterAnteilWG(32).anteil).toBe(0.5);
    expect(vermieterAnteilWG(37).anteil).toBe(0.6);
    expect(vermieterAnteilWG(42).anteil).toBe(0.7);
    expect(vermieterAnteilWG(47).anteil).toBe(0.8);
    expect(vermieterAnteilWG(52).anteil).toBe(0.95);
    expect(CO2KOSTAUFG_STUFEN_WG).toHaveLength(10);
  });

  it("rundet nach § 5 Abs. 1 auf eine Nachkommastelle VOR der Stufung", () => {
    // 11,96 → gerundet 12,0 → Stufe 2 (10 %), nicht Stufe 1
    expect(vermieterAnteilWG(11.96).anteil).toBe(0.1);
    // 11,94 → gerundet 11,9 → Stufe 1 (0 %)
    expect(vermieterAnteilWG(11.94).anteil).toBe(0.0);
  });

  it("rechnet Abrechnungszeiträume ≠ 12 Monate hoch", () => {
    // 6 Monate mit 10 kg/m² → hochgerechnet 20 kg/m²a → Stufe 3 (20 %)
    const half = computeCo2CostSplit(
      gasState(10 / ebevCo2KgPerKwh("erdgas")!),
      "Wohngebäude",
      100,
      55,
      6,
    );
    expect(half.co2KgM2aRounded).toBeCloseTo(20, 1);
    expect(half.vermieterAnteil).toBe(0.2);
  });

  it("verteilt die Kosten Vermieter/Mieter konsistent", () => {
    const result = computeCo2CostSplit(gasState(150), "Wohngebäude", 1000, 55);
    expect(result.totalEurPerYear).not.toBeNull();
    expect(
      result.vermieterEurPerYear! + result.mieterEurPerYear!,
    ).toBeCloseTo(result.totalEurPerYear!, 6);
  });
});

describe("Faktor-Hygiene: CO2-Abgabe nutzt EBeV, nicht GEG/CRREM", () => {
  it("Levy mit Erdgas nutzt 0,2016 (EBeV), nicht 0,201 (GEG-Näherung)", () => {
    const levy = computeCo2Levy(gasState(100), 1000);
    // 100 kWh/m² × 1000 m² × 0,2016 kg/kWh = 20,16 t
    expect(levy.fossilTonnesPerYear).toBeCloseTo(20.16, 4);
  });

  it("Strom wird nicht CO2-bepreist", () => {
    const state: EnergyState = {
      heatKwhM2a: 0,
      electricityKwhM2a: 100,
      perCarrier: [
        {
          carrier: "strom_netz",
          label: "Strom",
          heatKwhM2a: 0,
          electricityKwhM2a: 100,
        },
      ],
    };
    const levy = computeCo2Levy(state, 1000);
    expect(levy.fossilTonnesPerYear).toBe(0);
    expect(ebevCo2KgPerKwh("strom_netz")).toBeNull();
    expect(ebevCo2KgPerKwh("waermepumpe")).toBeNull();
    expect(ebevCo2KgPerKwh("holz")).toBeNull();
  });
});
