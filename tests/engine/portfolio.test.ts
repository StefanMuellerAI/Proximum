import { describe, expect, it } from "vitest";
import { normalizeExtraction, type EnergieausweisExtraction } from "@/lib/schema";
import { aggregatePortfolio } from "@/lib/engine/portfolio";
import { analyzeBase, analyzeScenario } from "@/lib/engine";

function nwg(
  area: number | undefined,
  heat: number,
  strom: number,
): EnergieausweisExtraction {
  return {
    gebaeudetyp: "Nichtwohngebäude",
    ausweistyp: "Verbrauchsausweis",
    hauptnutzung_gebaeudekategorie: "Büro",
    adresse: "Teststraße 1, 60311 Frankfurt",
    baujahr_gebaeude: 1995,
    energietraeger_heizung: ["Erdgas"],
    nettogrundflaeche_m2: area,
    endenergie_waerme_kwh_m2a: heat,
    endenergie_strom_kwh_m2a: strom,
    endenergie_je_traeger: [],
    modernisierungsempfehlungen: [],
  };
}

describe("aggregatePortfolio", () => {
  it("aggregiert Flächen, CO2 und Taxonomie-Quote über alle Gebäude", () => {
    const a = normalizeExtraction(nwg(1000, 100, 30));
    const b = normalizeExtraction(nwg(3000, 200, 50));

    const agg = aggregatePortfolio([
      { id: "a", name: "A", address: null, normalized: a, selectedMeasures: [], createdAt: "2026-01-01" },
      { id: "b", name: "B", address: null, normalized: b, selectedMeasures: [], createdAt: "2026-01-02" },
    ]);

    expect(agg.count).toBe(2);
    expect(agg.weightedCount).toBe(2);
    expect(agg.totalAreaM2).toBe(4000);

    const baseA = analyzeBase(a);
    const baseB = analyzeBase(b);
    expect(agg.totalCo2TonnesPerYear).toBeCloseTo(
      (baseA.co2.tonnesPerYear ?? 0) + (baseB.co2.tonnesPerYear ?? 0),
      4,
    );
  });

  it("die Portfolio-Kurve ist der flächengewichtete Mittelwert", () => {
    const a = normalizeExtraction(nwg(1000, 100, 30));
    const b = normalizeExtraction(nwg(3000, 200, 50));
    const agg = aggregatePortfolio([
      { id: "a", name: "A", address: null, normalized: a, selectedMeasures: [], createdAt: "2026-01-01" },
      { id: "b", name: "B", address: null, normalized: b, selectedMeasures: [], createdAt: "2026-01-02" },
    ]);

    const seriesA = analyzeBase(a).crrem.series;
    const seriesB = analyzeBase(b).crrem.series;
    const expected =
      (seriesA[0].gebaeude * 1000 + seriesB[0].gebaeude * 3000) / 4000;
    expect(agg.series[0].gebaeude).toBeCloseTo(expected, 1);
  });

  it("ohne Maßnahmen entspricht die Szenario-Kurve der Ist-Kurve", () => {
    const a = normalizeExtraction(nwg(1000, 100, 30));
    const agg = aggregatePortfolio([
      { id: "a", name: "A", address: null, normalized: a, selectedMeasures: [], createdAt: "2026-01-01" },
    ]);
    expect(agg.hasScenario).toBe(false);
    expect(agg.scenarioSeries).toEqual(agg.series);
    expect(agg.scenarioStrandingYear).toBe(agg.portfolioStrandingYear);
  });

  it("mit Maßnahmen liegt die Szenario-Kurve unter der Ist-Kurve", () => {
    const a = normalizeExtraction(nwg(1000, 100, 30));
    const agg = aggregatePortfolio([
      {
        id: "a",
        name: "A",
        address: null,
        normalized: a,
        selectedMeasures: ["waermepumpe", "led"],
        createdAt: "2026-01-01",
      },
    ]);
    expect(agg.hasScenario).toBe(true);
    expect(agg.scenarioSeries.length).toBe(agg.series.length);
    expect(agg.scenarioSeries[0].gebaeude).toBeLessThan(
      agg.series[0].gebaeude,
    );
    // Szenario-Stranding darf nicht frueher liegen als das Ist-Stranding
    if (agg.portfolioStrandingYear != null && agg.scenarioStrandingYear != null)
      expect(agg.scenarioStrandingYear).toBeGreaterThanOrEqual(
        agg.portfolioStrandingYear,
      );
  });

  it("Mischfall: Gebäude ohne Maßnahmen geht mit Ist-Kurve ins Szenario ein", () => {
    const a = normalizeExtraction(nwg(1000, 100, 30));
    const b = normalizeExtraction(nwg(3000, 200, 50));
    const agg = aggregatePortfolio([
      {
        id: "a",
        name: "A",
        address: null,
        normalized: a,
        selectedMeasures: ["waermepumpe"],
        createdAt: "2026-01-01",
      },
      { id: "b", name: "B", address: null, normalized: b, selectedMeasures: [], createdAt: "2026-01-02" },
    ]);
    expect(agg.hasScenario).toBe(true);

    const scenA = analyzeScenario(a, ["waermepumpe"]).result.crrem.series;
    const baseB = analyzeBase(b).crrem.series;
    const expected =
      (scenA[0].gebaeude * 1000 + baseB[0].gebaeude * 3000) / 4000;
    expect(agg.scenarioSeries[0].gebaeude).toBeCloseTo(expected, 1);
  });

  it("Gebäude ohne Fläche fließen nicht in die gewichtete Kurve ein", () => {
    const a = normalizeExtraction(nwg(1000, 100, 30));
    const noArea = normalizeExtraction(nwg(undefined, 150, 40));
    const agg = aggregatePortfolio([
      { id: "a", name: "A", address: null, normalized: a, selectedMeasures: [], createdAt: "2026-01-01" },
      { id: "n", name: "N", address: null, normalized: noArea, selectedMeasures: [], createdAt: "2026-01-02" },
    ]);
    expect(agg.count).toBe(2);
    expect(agg.weightedCount).toBe(1);
    expect(agg.totalAreaM2).toBe(1000);
    // Kurve entspricht dann exakt Gebaeude A
    expect(agg.series[0].gebaeude).toBeCloseTo(
      analyzeBase(a).crrem.series[0].gebaeude,
      1,
    );
  });
});
