/**
 * Audit-Test Faktor-Hygiene (Abnahme 4.8, Spez. 2.5):
 * EBeV-, GEG- und CRREM-Faktorwelten duerfen nie vermischt werden -
 * je Rechenzweck genau eine Quelle. Statischer Quelltext-Scan.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ENGINE = join(__dirname, "..", "..", "lib", "engine");

const src = (file: string) => readFileSync(join(ENGINE, file), "utf8");

describe("Faktor-Hygiene (statischer Audit)", () => {
  it("CO2-Abgabe (co2levy.ts) nutzt NUR die EBeV-Welt", () => {
    const code = src("co2levy.ts");
    expect(code).toContain("ebevCo2KgPerKwh");
    expect(code).not.toContain("carrierCo2KgPerKwh");
    expect(code).not.toContain("gridEfForYear");
  });

  it("CO2KostAufG-Split (co2-cost-split.ts) nutzt NUR die EBeV-Welt", () => {
    const code = src("co2-cost-split.ts");
    expect(code).toContain("ebevCo2KgPerKwh");
    expect(code).not.toContain("carrierCo2KgPerKwh");
    expect(code).not.toContain("gridEfForYear");
  });

  it("CO2e-Intensität (co2.ts) nutzt GEG-/CRREM-Welt, NIE EBeV", () => {
    const code = src("co2.ts");
    expect(code).toContain("carrierCo2KgPerKwh");
    expect(code).not.toContain("ebevCo2KgPerKwh");
    expect(code).not.toContain("EBEV_CO2_FACTORS");
  });

  it("CRREM (crrem.ts) bezieht Faktoren ausschließlich über co2.ts/crrem-Daten", () => {
    const code = src("crrem.ts");
    expect(code).not.toContain("ebevCo2KgPerKwh");
    expect(code).not.toContain("EBEV_CO2_FACTORS");
    expect(code).not.toContain("carrierCo2KgPerKwh");
  });
});
