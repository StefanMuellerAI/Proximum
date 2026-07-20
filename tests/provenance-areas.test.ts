import { describe, expect, it } from "vitest";
import {
  applyProvenanced,
  mayOverride,
  provenanced,
} from "@/lib/provenance";
import { afFromMf, bgfFromNgf, mfFromEbf } from "@/lib/engine/areas";

describe("Provenance-Präzedenz (2.13-2)", () => {
  it("manuell schlägt alles; typologie schlägt nichts", () => {
    expect(mayOverride("ausweis", "manuell")).toBe(true);
    expect(mayOverride("manuell", "ausweis")).toBe(false);
    expect(mayOverride("manuell", "vision")).toBe(false);
    expect(mayOverride("manuell", "typologie")).toBe(false);
    expect(mayOverride("vision", "ausweis")).toBe(true);
    expect(mayOverride("typologie", "vision")).toBe(true);
    expect(mayOverride("ausweis", "typologie")).toBe(false);
  });

  it("Re-Enrichment überschreibt manuelle Eingaben nie automatisch", () => {
    const manual = provenanced(42, "manuell");
    const vision = provenanced(50, "vision");
    expect(applyProvenanced(manual, vision).value).toBe(42);
    expect(applyProvenanced(vision, manual).value).toBe(42);
  });

  it("gleichrangige Quellen dürfen aktualisieren (neuere Daten)", () => {
    const old = provenanced(10, "ausweis");
    const neu = provenanced(12, "ausweis");
    expect(applyProvenanced(old, neu).value).toBe(12);
  });
});

describe("Flächenumrechnung (Spez. 2.10-6)", () => {
  it("BGF = NGF / 0,85", () => {
    expect(bgfFromNgf(850)).toBeCloseTo(1000, 6);
  });

  it("MF = EBF × 0,84 (WG) bzw. × 0,96 (NWG)", () => {
    expect(mfFromEbf(1000, "Wohngebäude")).toBeCloseTo(840, 6);
    expect(mfFromEbf(1000, "Nichtwohngebäude")).toBeCloseTo(960, 6);
  });

  it("AF über GRESB-Faktor", () => {
    expect(afFromMf(1000)).toBeCloseTo(100, 6);
    expect(afFromMf(1000, 0.15)).toBeCloseTo(150, 6);
  });
});
