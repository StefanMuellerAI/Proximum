import { describe, expect, it } from "vitest";
import {
  normalizeExtraction,
  normalizedBuildingSchema,
  type EnergieausweisExtraction,
} from "@/lib/schema";
import { getDemo } from "@/lib/demo";

function base(
  overrides: Partial<EnergieausweisExtraction>,
): EnergieausweisExtraction {
  return {
    gebaeudetyp: "Nichtwohngebäude",
    ausweistyp: "Verbrauchsausweis",
    hauptnutzung_gebaeudekategorie: "Büro",
    energietraeger_heizung: ["Erdgas"],
    nettogrundflaeche_m2: 2000,
    endenergie_waerme_kwh_m2a: 100,
    endenergie_strom_kwh_m2a: 30,
    endenergie_je_traeger: [],
    modernisierungsempfehlungen: [],
    ...overrides,
  };
}

function flagsFor(b: ReturnType<typeof normalizeExtraction>, field: string) {
  return b.flags.filter((f) => f.field === field);
}

describe("Plausibilitäts-Flags", () => {
  it("plausible Werte erzeugen keine Warnungen", () => {
    const b = normalizeExtraction(base({ primaerenergie_kwh_m2a: 140 }));
    expect(b.flags.filter((f) => f.severity === "warnung")).toHaveLength(0);
  });

  it("fehlende Fläche -> Warnung am Flächenfeld", () => {
    const b = normalizeExtraction(base({ nettogrundflaeche_m2: undefined }));
    const flags = flagsFor(b, "bezugsflaecheM2");
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0].severity).toBe("warnung");
  });

  it("extreme Endenergie Wärme -> Warnung", () => {
    const b = normalizeExtraction(base({ endenergie_waerme_kwh_m2a: 900 }));
    expect(flagsFor(b, "heatKwhM2a").some((f) => f.severity === "warnung")).toBe(
      true,
    );
  });

  it("inkonsistente Primärenergie -> Warnung", () => {
    // Endenergie 130, PE 700 -> Verhältnis > 3
    const b = normalizeExtraction(base({ primaerenergie_kwh_m2a: 700 }));
    expect(flagsFor(b, "primaryKwhM2a").length).toBeGreaterThan(0);
  });

  it("unplausibles Baujahr -> Warnung", () => {
    const b = normalizeExtraction(base({ baujahr_gebaeude: 1700 }));
    expect(flagsFor(b, "baujahr").length).toBeGreaterThan(0);
  });

  it("ungültige Effizienzklasse -> Hinweis", () => {
    const b = normalizeExtraction(base({ energieeffizienzklasse: "X9" }));
    const flags = flagsFor(b, "epcClass");
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0].severity).toBe("hinweis");
  });

  it("geringe Modell-Konfidenz -> Warnung am zugehörigen Feld", () => {
    const b = normalizeExtraction(
      base({ konfidenz_kernfelder: { endenergie: "gering", flaeche: "hoch" } }),
    );
    expect(
      flagsFor(b, "heatKwhM2a").some((f) => f.severity === "warnung"),
    ).toBe(true);
    // "hoch" erzeugt kein Flag
    expect(flagsFor(b, "bezugsflaecheM2")).toHaveLength(0);
  });
});

describe("normalizedBuildingSchema (API-Validierung)", () => {
  it("akzeptiert das Ergebnis von normalizeExtraction", () => {
    const { normalized } = getDemo();
    const parsed = normalizedBuildingSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
  });

  it("weist unbekannte Energieträger und CRREM-Typen ab", () => {
    const { normalized } = getDemo();
    expect(
      normalizedBuildingSchema.safeParse({ ...normalized, heatCarrier: "atomkraft" })
        .success,
    ).toBe(false);
    expect(
      normalizedBuildingSchema.safeParse({ ...normalized, crremType: "XXX" })
        .success,
    ).toBe(false);
  });

  it("weist Werte außerhalb der Grenzen ab", () => {
    const { normalized } = getDemo();
    expect(
      normalizedBuildingSchema.safeParse({ ...normalized, wwrPercent: 150 })
        .success,
    ).toBe(false);
    expect(
      normalizedBuildingSchema.safeParse({ ...normalized, heatKwhM2a: -5 })
        .success,
    ).toBe(false);
  });
});
