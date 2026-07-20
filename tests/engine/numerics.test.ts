import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  classifyByBands,
  interpolateSeries,
  roundCo2KostAufG,
  roundTo,
  type ClassBand,
} from "@/lib/engine/numerics";

const GEG_BANDS: ClassBand[] = [
  { label: "A+", max: 30 },
  { label: "A", max: 50 },
  { label: "B", max: 75 },
  { label: "C", max: 100 },
  { label: "D", max: 130 },
  { label: "E", max: 160 },
  { label: "F", max: 200 },
  { label: "G", max: 250 },
  { label: "H", max: null },
];

describe("classifyByBands", () => {
  it("lte: Grenzwert gehört noch zur Klasse (GEG ≤)", () => {
    expect(classifyByBands(30, GEG_BANDS, "lte")).toBe("A+");
    expect(classifyByBands(30.001, GEG_BANDS, "lte")).toBe("A");
    expect(classifyByBands(250, GEG_BANDS, "lte")).toBe("G");
    expect(classifyByBands(250.001, GEG_BANDS, "lte")).toBe("H");
  });

  it("lt: Grenzwert gehört bereits zur nächsten Klasse (OIB <)", () => {
    expect(classifyByBands(30, GEG_BANDS, "lt")).toBe("A");
    expect(classifyByBands(29.999, GEG_BANDS, "lt")).toBe("A+");
  });

  it("Property: jede Grenze beidseitig (±0,001) konsistent zur Inklusivität", () => {
    for (const boundary of ["lte", "lt"] as const) {
      for (let i = 0; i < GEG_BANDS.length - 1; i++) {
        const max = GEG_BANDS[i].max!;
        const below = classifyByBands(max - 0.001, GEG_BANDS, boundary);
        const at = classifyByBands(max, GEG_BANDS, boundary);
        const above = classifyByBands(max + 0.001, GEG_BANDS, boundary);
        expect(below).toBe(GEG_BANDS[i].label);
        expect(above).toBe(GEG_BANDS[i + 1].label);
        expect(at).toBe(
          boundary === "lte" ? GEG_BANDS[i].label : GEG_BANDS[i + 1].label,
        );
      }
    }
  });

  it("Property: Klassifizierung ist monoton (höherer Wert nie bessere Klasse)", () => {
    const order = GEG_BANDS.map((b) => b.label);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 500, noNaN: true }),
        (a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          const cLo = order.indexOf(classifyByBands(lo, GEG_BANDS, "lte"));
          const cHi = order.indexOf(classifyByBands(hi, GEG_BANDS, "lte"));
          return cLo <= cHi;
        },
      ),
    );
  });
});

describe("roundTo / roundCo2KostAufG", () => {
  it("rundet kaufmännisch", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundCo2KostAufG(34.95)).toBe(35.0);
    expect(roundCo2KostAufG(34.94)).toBe(34.9);
  });

  it("Property: Ergebnis hat höchstens n Nachkommastellen", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e6, noNaN: true }),
        fc.integer({ min: 0, max: 4 }),
        (v, n) => {
          const r = roundTo(v, n);
          return Math.abs(r * 10 ** n - Math.round(r * 10 ** n)) < 1e-6;
        },
      ),
    );
  });
});

describe("interpolateSeries", () => {
  const series = { 2020: 100, 2030: 50, 2050: 10 };

  it("liefert Stützstellen exakt", () => {
    expect(interpolateSeries(series, 2020)).toBe(100);
    expect(interpolateSeries(series, 2030)).toBe(50);
    expect(interpolateSeries(series, 2050)).toBe(10);
  });

  it("interpoliert linear zwischen Stützstellen", () => {
    expect(interpolateSeries(series, 2025)).toBe(75);
    expect(interpolateSeries(series, 2040)).toBe(30);
  });

  it("schreibt Randwerte konstant fort (keine Extrapolation)", () => {
    expect(interpolateSeries(series, 2010)).toBe(100);
    expect(interpolateSeries(series, 2060)).toBe(10);
  });

  it("Property: Ergebnis liegt immer zwischen Min und Max der Reihe", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 2070 }), (year) => {
        const v = interpolateSeries(series, year);
        return v >= 10 && v <= 100;
      }),
    );
  });
});
