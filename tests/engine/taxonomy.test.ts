import { describe, expect, it } from "vitest";
import {
  computeTaxonomy,
  computeDnshAdaptation,
} from "@/lib/engine/taxonomy";
import {
  TAXONOMY_PED_TOP15,
  taxonomyNzebThreshold,
} from "@/lib/data/reference";
import type { Hazard, RiskResult } from "@/lib/risk";

describe("computeTaxonomy", () => {
  it("EPC-Klasse A(+) zählt direkt als konform", () => {
    expect(computeTaxonomy(200, "A", 1990, "OFF").aligned).toBe(true);
    expect(computeTaxonomy(null, "A+", 1990, "RMF").aligned).toBe(true);
  });

  it("Bestand: nutzungsspezifische Top-15%-Schwelle", () => {
    const threshold = TAXONOMY_PED_TOP15.OFF; // 90
    expect(computeTaxonomy(threshold - 1, null, 1990, "OFF").aligned).toBe(true);
    expect(computeTaxonomy(threshold + 1, null, 1990, "OFF").aligned).toBe(false);
    expect(computeTaxonomy(threshold - 1, null, 1990, "OFF").thresholdKwhM2a).toBe(
      threshold,
    );
  });

  it("Neubau ab 2021: strengere NZEB-Schwelle", () => {
    const nzeb = taxonomyNzebThreshold("OFF");
    expect(nzeb).toBeLessThan(TAXONOMY_PED_TOP15.OFF);
    expect(computeTaxonomy(nzeb + 1, null, 2022, "OFF").aligned).toBe(false);
    expect(computeTaxonomy(nzeb - 1, null, 2022, "OFF").aligned).toBe(true);
  });

  it("ohne Primärenergiewert nicht belegbar", () => {
    const r = computeTaxonomy(null, null, 1990, "OFF");
    expect(r.aligned).toBe(false);
    expect(r.criterion).toBe("Primärenergie");
  });
});

function hazard(partial: Partial<Hazard>): Hazard {
  return {
    gruppe: "Hitze",
    label: "Hitze 2031-2060",
    anzeigewert: 50,
    unsicherheitsgrad: 1,
    unsicherheitstext: "",
    category: "Temperatur",
    timeframe: "nah",
    level: "mittel",
    ...partial,
  };
}

function riskWith(hazards: Hazard[]): RiskResult {
  return {
    location: {
      lat: 50,
      lon: 8,
      xUtm: 0,
      yUtm: 0,
      strasseHausnummer: "",
      plz: "",
      ort: "",
      matchedLabel: "",
    },
    hazards,
    groups: {},
  };
}

describe("computeDnshAdaptation", () => {
  it("ohne Screening nicht bewertbar", () => {
    expect(computeDnshAdaptation(null).status).toBe("nicht_bewertbar");
  });

  it("nur niedrige Zukunfts-Gefährdungen -> konform", () => {
    const r = computeDnshAdaptation(
      riskWith([hazard({ level: "gering" }), hazard({ level: "mittel" })]),
    );
    expect(r.status).toBe("konform");
    expect(r.findings).toHaveLength(0);
  });

  it("hohe Zukunfts-Gefährdung -> Maßnahmen erforderlich mit Anpassungsmaßnahme", () => {
    const r = computeDnshAdaptation(
      riskWith([
        hazard({ level: "hoch", gruppe: "Starkregen", label: "Starkregen 2031-2060" }),
        hazard({ level: "gering" }),
      ]),
    );
    expect(r.status).toBe("massnahmen_erforderlich");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].adaptationMeasure).toContain("Rückstausicherung");
  });

  it("Gegenwarts-/Referenzwerte zählen nicht als Zukunfts-Gefährdung", () => {
    const r = computeDnshAdaptation(
      riskWith([
        hazard({ level: "sehr hoch", timeframe: "Gegenwart" }),
        hazard({ level: "gering", timeframe: "nah" }),
      ]),
    );
    expect(r.status).toBe("konform");
  });
});
