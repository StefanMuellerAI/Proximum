import { describe, expect, it } from "vitest";
import {
  countryGridEf,
  detectCountry,
  frFinalEnergyFromPrimary,
  CRREM_GRID_EF_2020_BY_COUNTRY,
  FR_PEF_ELECTRICITY,
} from "@/lib/engine/country";

describe("Multi-Country (GAP-10)", () => {
  it("CRREM-Strom-Basisfaktoren 2020 laut Spezifikation", () => {
    expect(CRREM_GRID_EF_2020_BY_COUNTRY).toEqual({
      DE: 0.339,
      AT: 0.111,
      PL: 0.76,
      FR: 0.051,
    });
  });

  it("skaliert den DE-Netzpfad auf das nationale 2020-Niveau", () => {
    // DE 2020 = 0,339; DE 2035 (Beispiel) = 0,17 → Ratio 0,5
    expect(countryGridEf("AT", 0.1695, 0.339)).toBeCloseTo(0.111 * 0.5, 6);
    expect(countryGridEf("PL", 0.339, 0.339)).toBeCloseTo(0.76, 6);
    expect(countryGridEf("DE", 0.2, 0.339)).toBe(0.2);
  });

  it("FR: DPE-PE-Rückrechnung (Strom / 2,3)", () => {
    // 100 % Strom: 230 kWh PE → 100 kWh Endenergie
    expect(frFinalEnergyFromPrimary(230, 1)).toBeCloseTo(100, 5);
    // 0 % Strom: 1:1
    expect(frFinalEnergyFromPrimary(150, 0)).toBeCloseTo(150, 5);
    // 50/50
    expect(frFinalEnergyFromPrimary(230, 0.5)).toBeCloseTo(115 / FR_PEF_ELECTRICITY + 115, 5);
  });

  it("erkennt das Land aus Feld oder Adressformat", () => {
    expect(detectCountry({ land: "Österreich" })).toBe("AT");
    expect(detectCountry({ land: "FR" })).toBe("FR");
    expect(detectCountry({ adresse: "ul. Prosta 5, 00-838 Warszawa" })).toBe("PL");
    expect(detectCountry({ adresse: "12 Rue de la Paix, F-75002 Paris, France" })).toBe("FR");
    expect(detectCountry({ adresse: "Hauptplatz 1, A-8010 Graz, Österreich" })).toBe("AT");
    expect(detectCountry({ adresse: "Beispielstr. 1, 60311 Frankfurt" })).toBe("DE");
    expect(detectCountry({})).toBe("DE");
  });
});
