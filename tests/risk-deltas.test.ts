import { describe, expect, it } from "vitest";
import { hazardDeltas, type Hazard } from "@/lib/risk";

function hazard(partial: Partial<Hazard>): Hazard {
  return {
    gruppe: "Hitze",
    label: "Hitze",
    anzeigewert: 40,
    unsicherheitsgrad: 1,
    unsicherheitstext: "",
    category: "Temperatur",
    timeframe: "Gegenwart",
    level: "gering",
    ...partial,
  };
}

describe("hazardDeltas", () => {
  it("berechnet Gegenwart, 2050 und 2070+ mit Deltas je Gruppe", () => {
    const deltas = hazardDeltas([
      hazard({ anzeigewert: 24, timeframe: "Gegenwart" }),
      hazard({ anzeigewert: 41, timeframe: "nah" }),
      hazard({ anzeigewert: 62, timeframe: "fern" }),
      hazard({ gruppe: "Starkregen", anzeigewert: 50, timeframe: "Gegenwart" }),
    ]);

    const hitze = deltas.find((d) => d.gruppe === "Hitze")!;
    expect(hitze.present).toBe(24);
    expect(hitze.near).toBe(41);
    expect(hitze.nearDelta).toBe(17);
    expect(hitze.far).toBe(62);
    expect(hitze.farDelta).toBe(38);

    const regen = deltas.find((d) => d.gruppe === "Starkregen")!;
    expect(regen.present).toBe(50);
    expect(regen.near).toBeNull();
    expect(regen.nearDelta).toBeNull();
  });

  it("nimmt das Maximum je Zeitfenster (mittel + fern)", () => {
    const deltas = hazardDeltas([
      hazard({ anzeigewert: 30, timeframe: "Gegenwart" }),
      hazard({ anzeigewert: 45, timeframe: "mittel" }),
      hazard({ anzeigewert: 55, timeframe: "fern" }),
    ]);
    expect(deltas[0].far).toBe(55);
    expect(deltas[0].farDelta).toBe(25);
  });

  it("Referenzwerte fliessen nicht ein", () => {
    const deltas = hazardDeltas([
      hazard({ anzeigewert: 90, timeframe: "Referenz" }),
      hazard({ anzeigewert: 20, timeframe: "Gegenwart" }),
    ]);
    expect(deltas[0].present).toBe(20);
    expect(deltas[0].near).toBeNull();
    expect(deltas[0].far).toBeNull();
  });
});
