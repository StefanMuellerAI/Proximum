import { describe, expect, it } from "vitest";
import {
  classifySolarEignung,
  mapBuildingInsights,
  pvYieldFromSolar,
  solarUnavailable,
  withinSolarDistance,
  PV_YIELD_CAP_KWH_M2A,
} from "@/lib/solar";
import { roundWwrToStep } from "@/lib/facade";
import { precisionFromAddress } from "@/lib/geocode";

const HOCHHEIM = { lat: 50.014, lon: 8.352 };

function insights(overrides?: {
  center?: { latitude: number; longitude: number };
  yearly?: number[];
  area?: number;
  sunshine?: number;
}) {
  return {
    center: overrides?.center ?? {
      latitude: HOCHHEIM.lat,
      longitude: HOCHHEIM.lon,
    },
    imageryQuality: "HIGH",
    imageryDate: { year: 2024, month: 6, day: 3 },
    solarPotential: {
      maxArrayAreaMeters2: overrides?.area ?? 1200,
      maxSunshineHoursPerYear: overrides?.sunshine ?? 1000,
      solarPanelConfigs: (overrides?.yearly ?? [50_000, 180_000, 120_000]).map(
        (y) => ({ yearlyEnergyDcKwh: y }),
      ),
    },
  };
}

describe("mapBuildingInsights", () => {
  it("extrahiert Ertrag (Maximum der Konfigurationen), Fläche und Befliegung", () => {
    const s = mapBuildingInsights(insights(), HOCHHEIM.lat, HOCHHEIM.lon);
    expect(s.status).toBe("ok");
    expect(s.yearlyEnergyDcKwh).toBe(180_000);
    expect(s.roofAreaM2).toBe(1200);
    expect(s.maxSunshineHoursPerYear).toBe(1000);
    expect(s.eignung).toBe("mittel");
    expect(s.imageryDate).toBe("2024-06-03");
    expect(s.imageryQuality).toBe("HIGH");
  });

  it("verwirft Gebäude, die zu weit von der Adresse entfernt sind", () => {
    // ~200 m noerdlich
    const s = mapBuildingInsights(
      insights({ center: { latitude: HOCHHEIM.lat + 0.0018, longitude: HOCHHEIM.lon } }),
      HOCHHEIM.lat,
      HOCHHEIM.lon,
    );
    expect(s.status).toBe("unavailable");
    expect(s.reason).toMatch(/zu weit/);
  });

  it("ohne solarPotential -> unavailable", () => {
    const s = mapBuildingInsights(
      { center: { latitude: HOCHHEIM.lat, longitude: HOCHHEIM.lon } },
      HOCHHEIM.lat,
      HOCHHEIM.lon,
    );
    expect(s.status).toBe("unavailable");
  });
});

describe("withinSolarDistance", () => {
  it("akzeptiert nahe Gebäude und verwirft ferne", () => {
    expect(
      withinSolarDistance(HOCHHEIM.lat, HOCHHEIM.lon, HOCHHEIM.lat + 0.0003, HOCHHEIM.lon),
    ).toBe(true); // ~33 m
    expect(
      withinSolarDistance(HOCHHEIM.lat, HOCHHEIM.lon, HOCHHEIM.lat + 0.001, HOCHHEIM.lon),
    ).toBe(false); // ~111 m
  });
});

describe("pvYieldFromSolar", () => {
  it("rechnet den Jahresertrag deterministisch auf die Bezugsfläche um", () => {
    const s = mapBuildingInsights(insights({ yearly: [100_000] }), HOCHHEIM.lat, HOCHHEIM.lon);
    // 100000 kWh DC * 0.85 / 6121 m² = 13.88 -> 14
    expect(pvYieldFromSolar(s, 6121)).toBe(14);
  });

  it("kappt auf die Obergrenze (großes Dach, kleines Gebäude)", () => {
    const s = mapBuildingInsights(insights({ yearly: [900_000] }), HOCHHEIM.lat, HOCHHEIM.lon);
    expect(pvYieldFromSolar(s, 1000)).toBe(PV_YIELD_CAP_KWH_M2A);
  });

  it("liefert null ohne Daten oder ohne Fläche", () => {
    expect(pvYieldFromSolar(solarUnavailable("x"), 1000)).toBeNull();
    expect(pvYieldFromSolar(null, 1000)).toBeNull();
    const s = mapBuildingInsights(insights(), HOCHHEIM.lat, HOCHHEIM.lon);
    expect(pvYieldFromSolar(s, null)).toBeNull();
    expect(pvYieldFromSolar(s, 0)).toBeNull();
  });
});

describe("classifySolarEignung", () => {
  it("klassifiziert nach festen Sonnenstunden-Schwellen", () => {
    expect(classifySolarEignung(1100)).toBe("hoch");
    expect(classifySolarEignung(1050)).toBe("hoch");
    expect(classifySolarEignung(1000)).toBe("mittel");
    expect(classifySolarEignung(900)).toBe("mittel");
    expect(classifySolarEignung(850)).toBe("gering");
  });
});

describe("roundWwrToStep", () => {
  it("rundet auf 5-%-Stufen und klemmt auf 0..100", () => {
    expect(roundWwrToStep(32)).toBe(30);
    expect(roundWwrToStep(33)).toBe(35);
    expect(roundWwrToStep(31)).toBe(30);
    expect(roundWwrToStep(0)).toBe(0);
    expect(roundWwrToStep(100)).toBe(100);
    expect(roundWwrToStep(99)).toBe(100);
  });

  it("macht Schwankungen um eine Stufe herum unsichtbar (±1 um Vielfache von 5)", () => {
    expect(roundWwrToStep(29)).toBe(roundWwrToStep(31));
    expect(roundWwrToStep(34)).toBe(roundWwrToStep(36));
  });
});

describe("precisionFromAddress (Geocoding-Gate)", () => {
  it("Hausnummer -> adresse, nur Straße -> strasse, sonst ort", () => {
    expect(
      precisionFromAddress({ road: "Frankfurter Straße", house_number: "94" }),
    ).toBe("adresse");
    expect(precisionFromAddress({ road: "Frankfurter Straße" })).toBe("strasse");
    expect(precisionFromAddress({})).toBe("ort");
    expect(precisionFromAddress(undefined)).toBe("ort");
  });
});
