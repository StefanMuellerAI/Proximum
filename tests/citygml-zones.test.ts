import { describe, expect, it } from "vitest";
import {
  parseCityGml,
  polygonArea3d,
  thermalComponentsFromLoD2,
} from "@/lib/import/citygml";
import { computeZonedCrrem, normalizeZones } from "@/lib/engine/zones";
import { pathwayForYear } from "@/lib/engine/crrem";

/** Minimales CityGML-Fragment: Quader 10 x 8 m Grundflaeche, 6 m hoch. */
const GML = `<?xml version="1.0"?>
<CityModel xmlns:bldg="http://www.opengis.net/citygml/building/2.0" xmlns:gml="http://www.opengis.net/gml">
 <cityObjectMember>
  <bldg:Building gml:id="DEBY_123">
   <bldg:measuredHeight uom="m">6.0</bldg:measuredHeight>
   <bldg:boundedBy>
    <bldg:GroundSurface>
     <gml:posList>0 0 0 10 0 0 10 8 0 0 8 0 0 0 0</gml:posList>
    </bldg:GroundSurface>
   </bldg:boundedBy>
   <bldg:boundedBy>
    <bldg:RoofSurface>
     <gml:posList>0 0 6 10 0 6 10 8 6 0 8 6 0 0 6</gml:posList>
    </bldg:RoofSurface>
   </bldg:boundedBy>
   <bldg:boundedBy>
    <bldg:WallSurface>
     <gml:posList>0 0 0 10 0 0 10 0 6 0 0 6 0 0 0</gml:posList>
    </bldg:WallSurface>
   </bldg:boundedBy>
   <bldg:boundedBy>
    <bldg:WallSurface>
     <gml:posList>0 8 0 10 8 0 10 8 6 0 8 6 0 8 0</gml:posList>
    </bldg:WallSurface>
   </bldg:boundedBy>
   <bldg:boundedBy>
    <bldg:WallSurface>
     <gml:posList>0 0 0 0 8 0 0 8 6 0 0 6 0 0 0</gml:posList>
    </bldg:WallSurface>
   </bldg:boundedBy>
   <bldg:boundedBy>
    <bldg:WallSurface>
     <gml:posList>10 0 0 10 8 0 10 8 6 10 0 6 10 0 0</gml:posList>
    </bldg:WallSurface>
   </bldg:boundedBy>
  </bldg:Building>
 </cityObjectMember>
</CityModel>`;

describe("LoD2-CityGML-Importer (2.13-14)", () => {
  it("Newell-Flächenberechnung für 3D-Polygone", () => {
    // Rechteck 10 x 8 in der xy-Ebene
    expect(
      polygonArea3d([
        [0, 0, 0],
        [10, 0, 0],
        [10, 8, 0],
        [0, 8, 0],
      ]),
    ).toBeCloseTo(80, 5);
  });

  it("extrahiert Hüllflächen, Höhe, Volumen und EBF", () => {
    const buildings = parseCityGml(GML);
    expect(buildings).toHaveLength(1);
    const b = buildings[0];
    expect(b.gmlId).toBe("DEBY_123");
    expect(b.groundAreaM2).toBeCloseTo(80, 1);
    expect(b.roofAreaM2).toBeCloseTo(80, 1);
    // Waende: 2 x (10 x 6) + 2 x (8 x 6) = 216
    expect(b.wallAreaM2).toBeCloseTo(216, 1);
    expect(b.heightM).toBeCloseTo(6, 5);
    expect(b.volumeM3).toBeCloseTo(480, 1);
    // EBF = Volumen / 2,5 (Spez. 2.1)
    expect(b.ebfM2).toBeCloseTo(192, 1);
  });

  it("liefert Bauteil-Set für das thermische Modell (LoD2 + Vision-WWR)", () => {
    const [b] = parseCityGml(GML);
    const components = thermalComponentsFromLoD2(b, 25, 1965);
    const wall = components.find((c) => c.type === "wand")!;
    const window = components.find((c) => c.type === "fenster")!;
    expect(window.areaM2).toBeCloseTo(216 * 0.25, 1);
    expect(wall.areaM2).toBeCloseTo(216 * 0.75, 1);
    expect(components.find((c) => c.type === "dach")!.areaM2).toBeCloseTo(80, 1);
  });
});

describe("Zonenmodell Mischnutzung", () => {
  it("normalisiert Flächenanteile", () => {
    const zones = normalizeZones([
      { crremType: "OFF", areaShare: 2 },
      { crremType: "RMF", areaShare: 2 },
    ]);
    expect(zones[0].areaShare).toBe(0.5);
  });

  it("Misch-Pfad ist der flächengewichtete Mittelwert der Zonen-Pfade", () => {
    const result = computeZonedCrrem(
      [
        { crremType: "OFF", areaShare: 0.5 },
        { crremType: "RMF", areaShare: 0.5 },
      ],
      20,
      150,
    );
    const y2030 = result.series.find((p) => p.year === 2030)!;
    const expected =
      0.5 * pathwayForYear("OFF", 2030) + 0.5 * pathwayForYear("RMF", 2030);
    expect(y2030.pfad).toBeCloseTo(expected, 5);
    expect(result.strandingYear).not.toBeNull();
  });
});
