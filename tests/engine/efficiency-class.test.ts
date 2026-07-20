import { describe, expect, it } from "vitest";
import {
  computeEfficiencyClass,
  fraunhoferClass,
  fraunhoferPeRef,
  isMixedUse,
  worseClass,
} from "@/lib/engine/efficiency-class";
import { CLASS_SYSTEMS } from "@/lib/data/efficiency-classes";
import { classifyByBands } from "@/lib/engine/numerics";
import { analyzeBase, analyzeScenario } from "@/lib/engine";
import { getDemo } from "@/lib/demo";

describe("DE Wohngebäude (GEG-Tabelle, ≤)", () => {
  const base = {
    gebaeudetyp: "Wohngebäude" as const,
    ausweistyp: "Bedarfsausweis" as const,
  };

  it("ordnet Grenzwerte inklusiv zu (30 → A+, 250 → G, 250,1 → H)", () => {
    expect(
      computeEfficiencyClass({ ...base, heatEndEnergyKwhM2a: 30 })?.label,
    ).toBe("A+");
    expect(
      computeEfficiencyClass({ ...base, heatEndEnergyKwhM2a: 30.001 })?.label,
    ).toBe("A");
    expect(
      computeEfficiencyClass({ ...base, heatEndEnergyKwhM2a: 250 })?.label,
    ).toBe("G");
    expect(
      computeEfficiencyClass({ ...base, heatEndEnergyKwhM2a: 250.1 })?.label,
    ).toBe("H");
  });

  it("liefert null ohne Endenergie und für Mischgebäude", () => {
    expect(computeEfficiencyClass({ ...base, heatEndEnergyKwhM2a: null })).toBeNull();
    expect(
      computeEfficiencyClass({
        ...base,
        isMixedUse: true,
        heatEndEnergyKwhM2a: 100,
      }),
    ).toBeNull();
  });
});

describe("DE Nichtwohngebäude (Fraunhofer-Methode)", () => {
  it("Abnahme 4.3: PE_ref 258, PE 115,8 → Klasse B", () => {
    // Testvektor aus Spez. 2.2: Vergleichswert Wärme 66, Strom 103, GEG 2020
    const ref = fraunhoferPeRef({
      ausweistyp: "Verbrauchsausweis",
      gegStand: "GEG 2020",
      vergleichswertWaerme: 66,
      vergleichswertStrom: 103,
    });
    expect(ref).not.toBeNull();
    expect(ref!.peRef).toBeCloseTo(258, 5); // 66·1,1 + 103·1,8
    expect(fraunhoferClass(115.8, ref!.peRef)).toBe("B");
  });

  it("nutzt PEF nach Rechtsgrundlage (EnEV 2009: Strom 2,7)", () => {
    const ref = fraunhoferPeRef({
      ausweistyp: "Verbrauchsausweis",
      gegStand: "EnEV 2009",
      vergleichswertWaerme: 100,
      vergleichswertStrom: 100,
    });
    expect(ref!.peRef).toBeCloseTo(100 * 1.1 + 100 * 2.7, 5);
  });

  it("nutzt den PE-Anforderungswert direkt (Bedarfsausweis)", () => {
    const result = computeEfficiencyClass({
      gebaeudetyp: "Nichtwohngebäude",
      ausweistyp: "Bedarfsausweis",
      primaryEnergyKwhM2a: 90,
      peRefKwhM2a: 258,
    });
    // 90 / 258 = 0,349 → ≤ 0,35 → A
    expect(result?.label).toBe("A");
    expect(result?.peRefKwhM2a).toBe(258);
  });

  it("liefert null ohne Referenzwerte (Predium-Verhalten)", () => {
    expect(
      computeEfficiencyClass({
        gebaeudetyp: "Nichtwohngebäude",
        ausweistyp: "Bedarfsausweis",
        primaryEnergyKwhM2a: 100,
      }),
    ).toBeNull();
  });
});

describe("AT / PL / FR", () => {
  it("AT: HWB bevorzugt, Grenze exklusiv (25 → B, 24,999 → A)", () => {
    const at = (hwb: number) =>
      computeEfficiencyClass({
        country: "AT",
        gebaeudetyp: "Wohngebäude",
        ausweistyp: "Bedarfsausweis",
        hwbKwhM2a: hwb,
      })?.label;
    expect(at(24.999)).toBe("A");
    expect(at(25)).toBe("B");
    expect(at(9.999)).toBe("A++");
  });

  it("PL: nur Wohngebäude, PE-basiert (< 63 → A); NWG → null", () => {
    expect(
      computeEfficiencyClass({
        country: "PL",
        gebaeudetyp: "Wohngebäude",
        ausweistyp: "Bedarfsausweis",
        primaryEnergyKwhM2a: 62.9,
      })?.label,
    ).toBe("A");
    expect(
      computeEfficiencyClass({
        country: "PL",
        gebaeudetyp: "Nichtwohngebäude",
        ausweistyp: "Bedarfsausweis",
        primaryEnergyKwhM2a: 100,
      }),
    ).toBeNull();
  });

  it("FR: Doppelkriterium – schlechtere Klasse gewinnt", () => {
    // PE 100 → B; CO2 40 kg (Gruppe 1) → E → Gesamt E
    const result = computeEfficiencyClass({
      country: "FR",
      gebaeudetyp: "Wohngebäude",
      ausweistyp: "Bedarfsausweis",
      primaryEnergyKwhM2a: 100,
      co2KgM2a: 40,
    });
    expect(result?.label).toBe("E");
    expect(worseClass("B", "E")).toBe("E");
    expect(worseClass("A+", "A")).toBe("A");
  });
});

describe("Grenzwert-Property-Tests je Klassensystem (Abnahme 4.10)", () => {
  for (const system of CLASS_SYSTEMS) {
    it(`${system.id}: jede Grenze beidseitig (±0,001) konsistent zu ${system.boundary}`, () => {
      for (let i = 0; i < system.bands.length - 1; i++) {
        const max = system.bands[i].max!;
        const below = classifyByBands(max - 0.001, system.bands, system.boundary);
        const at = classifyByBands(max, system.bands, system.boundary);
        const above = classifyByBands(max + 0.001, system.bands, system.boundary);
        expect(below).toBe(system.bands[i].label);
        expect(above).toBe(system.bands[i + 1].label);
        expect(at).toBe(
          system.boundary === "lte"
            ? system.bands[i].label
            : system.bands[i + 1].label,
        );
      }
    });
  }
});

describe("Integration: Neuberechnung nach Maßnahmen (analyze)", () => {
  it("Basis- und Szenario-Analyse liefern eine berechnete Klasse", () => {
    const demo = getDemo();
    const base = analyzeBase(demo.normalized);
    // Demo ist ein NWG ohne Fraunhofer-Referenzen ODER ein WG – in beiden
    // Faellen darf die Engine nicht werfen; WG liefert eine Klasse.
    if (demo.normalized.gebaeudetyp === "Wohngebäude") {
      expect(base.efficiencyClass).not.toBeNull();
    }

    const scen = analyzeScenario(demo.normalized, ["fassade", "dach", "waermepumpe"]);
    // Nach Massnahmen wird neu berechnet (nicht null gesetzt), sofern eine
    // Klasse fuer den Gebaeudetyp existiert.
    if (base.efficiencyClass) {
      expect(scen.result.efficiencyClass).not.toBeNull();
    }
  });

  it("WG: Klasse verbessert sich durch Sanierung", () => {
    const demo = getDemo();
    const wg = {
      ...demo.normalized,
      gebaeudetyp: "Wohngebäude" as const,
      hauptnutzung: "Mehrfamilienhaus",
      heatKwhM2a: 210,
      electricityKwhM2a: 0,
      totalKwhM2a: 210,
      perCarrier: [
        {
          carrier: "erdgas" as const,
          label: "Erdgas",
          heatKwhM2a: 210,
          electricityKwhM2a: 0,
        },
      ],
      heatCarrier: "erdgas" as const,
    };
    const base = analyzeBase(wg);
    expect(base.efficiencyClass?.label).toBe("G"); // 210 ≤ 250 → G
    const scen = analyzeScenario(wg, ["fassade", "dach", "fenster"]);
    const order = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"];
    expect(
      order.indexOf(scen.result.efficiencyClass!.label),
    ).toBeLessThan(order.indexOf(base.efficiencyClass!.label));
  });

  it("erkennt Mischnutzung", () => {
    expect(isMixedUse("Gemischt genutztes Gebäude")).toBe(true);
    expect(isMixedUse("Bürogebäude")).toBe(false);
  });
});
