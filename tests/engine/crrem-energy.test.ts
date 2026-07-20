import { describe, expect, it } from "vitest";
import { computeCrrem, energyPathwayForYear, CRREM_VERSION } from "@/lib/engine/crrem";
import {
  climateFactors,
  heatNormalizationFactor,
  plzFromAddress,
} from "@/lib/engine/climate";
import { BASE_YEAR } from "@/lib/engine/types";
import type { EnergyState } from "@/lib/engine/types";

const state = (heat: number, elec: number): EnergyState => ({
  heatKwhM2a: heat,
  electricityKwhM2a: elec,
  perCarrier: [
    { carrier: "erdgas", label: "Erdgas", heatKwhM2a: heat, electricityKwhM2a: 0 },
    ...(elec > 0
      ? [
          {
            carrier: "strom_netz" as const,
            label: "Strom (Netzmix)",
            heatKwhM2a: 0,
            electricityKwhM2a: elec,
          },
        ]
      : []),
  ],
});

describe("CRREM-Energiepfad-Stranding (EUI, GAP-6)", () => {
  it("liefert Energiepfad-Serie mit eigenem Stranding-Jahr", () => {
    // Hoher Verbrauch: strandet auf dem Energiepfad frueh
    const result = computeCrrem(state(220, 40), "OFF");
    expect(result.energy.series.length).toBe(result.series.length);
    expect(result.energy.euiBase).toBe(260);
    expect(result.energy.strandingYear).not.toBeNull();
    expect(result.version).toBe(CRREM_VERSION);
  });

  it("Niedrigverbrauch strandet auf dem Energiepfad nicht (EUI < Pfad 2050)", () => {
    const path2050 = energyPathwayForYear("OFF", 2050);
    const result = computeCrrem(state(path2050 * 0.5, 0), "OFF");
    expect(result.energy.strandingYear).toBeNull();
  });

  it("EUI-Pfad ist monoton fallend", () => {
    for (let y = BASE_YEAR; y < 2050; y++) {
      expect(energyPathwayForYear("RMF", y + 1)).toBeLessThanOrEqual(
        energyPathwayForYear("RMF", y) + 1e-9,
      );
    }
  });
});

describe("Klimanormalisierung (Spez. 2.6)", () => {
  it("bedarfsbasiert: keine Normalisierung (Default)", () => {
    const result = computeCrrem(state(150, 30), "OFF");
    expect(result.climateNormalized).toBe(false);
    expect(result.areaReference).toBe("EBF");
    // EUI konstant ueber die Jahre
    const euis = result.energy.series.map((p) => p.gebaeude);
    expect(new Set(euis).size).toBe(1);
  });

  it("verbrauchsbasiert: HDD sinken -> Waermeanteil sinkt ueber die Jahre", () => {
    const result = computeCrrem(state(150, 30), "OFF", {
      consumptionBased: true,
      plz: "60311",
    });
    expect(result.climateNormalized).toBe(true);
    expect(result.areaReference).toBe("NGF");
    const first = result.energy.series[0].gebaeude;
    const last = result.energy.series[result.energy.series.length - 1].gebaeude;
    // DE: HDD-Trend negativ (waermere Winter) -> normalisierte EUI sinkt
    expect(last).toBeLessThan(first);
    // Stromanteil bleibt unveraendert (konservativ, keine Kuehl-Aufschluesselung)
    expect(last).toBeGreaterThanOrEqual(30);
  });

  it("Klimafaktoren: PLZ-Praefix-Lookup mit DE-Durchschnitts-Fallback", () => {
    const frankfurt = climateFactors("60311");
    const fallback = climateFactors(null);
    expect(frankfurt.hdd).toBeGreaterThan(1000);
    expect(fallback.hdd).toBeGreaterThan(1000);
    expect(heatNormalizationFactor(frankfurt, 2024)).toBeCloseTo(1, 10);
    // HDD-Trend negativ -> Faktor sinkt in der Zukunft
    expect(heatNormalizationFactor(frankfurt, 2050)).toBeLessThan(1);
  });

  it("extrahiert die PLZ aus Adressen", () => {
    expect(plzFromAddress("Beispielstr. 1, 60311 Frankfurt am Main")).toBe("60311");
    expect(plzFromAddress("Ohne PLZ")).toBeNull();
  });
});
