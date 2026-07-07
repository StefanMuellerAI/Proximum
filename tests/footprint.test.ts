import { describe, expect, it } from "vitest";
import {
  estimateHeight,
  isoProject,
  lonLatToLocal,
  pointInPolygon,
  polygonCentroid,
  type LocalPoint,
} from "@/lib/footprint";

describe("lonLatToLocal", () => {
  it("Zentrum liegt bei (0,0), Norden ist positiv", () => {
    expect(lonLatToLocal(50, 8, 50, 8)).toEqual([0, 0]);
    const [, north] = lonLatToLocal(50, 8, 50.001, 8);
    expect(north).toBeCloseTo(111.3, 0);
    const [east] = lonLatToLocal(50, 8, 50, 8.001);
    // ~71,6 m je 0,001 Grad Laenge bei 50 Grad Breite
    expect(east).toBeCloseTo(71.6, 0);
  });
});

describe("pointInPolygon", () => {
  const square: LocalPoint[] = [
    [-10, -10],
    [10, -10],
    [10, 10],
    [-10, 10],
  ];
  it("erkennt innen und aussen", () => {
    expect(pointInPolygon([0, 0], square)).toBe(true);
    expect(pointInPolygon([15, 0], square)).toBe(false);
  });
});

describe("polygonCentroid", () => {
  it("Mittelpunkt eines Quadrats", () => {
    const c = polygonCentroid([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(c[0]).toBeCloseTo(5);
    expect(c[1]).toBeCloseTo(5);
  });
});

describe("estimateHeight", () => {
  it("explizite Hoehe hat Vorrang", () => {
    expect(estimateHeight({ height: "12.5" }, 9)).toBe(12.5);
    expect(estimateHeight({ height: "12,5" }, 9)).toBe(12.5);
  });
  it("sonst Etagen x 3,3 m", () => {
    expect(estimateHeight({ "building:levels": "4" }, 9)).toBeCloseTo(13.2, 1);
  });
  it("sonst Default", () => {
    expect(estimateHeight(undefined, 9)).toBe(9);
    expect(estimateHeight({ height: "unsinn" }, 9)).toBe(9);
  });
});

describe("isoProject", () => {
  it("Hoehe verschiebt nur nach oben (negatives Bildschirm-y)", () => {
    const [x0, y0] = isoProject(10, 5, 0);
    const [x1, y1] = isoProject(10, 5, 8);
    expect(x1).toBe(x0);
    expect(y1).toBeCloseTo(y0 - 8);
  });
  it("Punkte mit gleichem x+y liegen auf gleicher Bildschirmhoehe", () => {
    const [, ya] = isoProject(10, 0, 0);
    const [, yb] = isoProject(0, 10, 0);
    expect(ya).toBeCloseTo(yb);
  });
});
