/**
 * Regressionstests fuer den Energietraeger-Split (Bug "Hochheim":
 * invertierte Waerme/Strom-Zuordnung, weil die Extraktion die Reihenfolge
 * der Seite-1-Energietraeger als Dominanz interpretiert hatte).
 *
 * Referenz: Ausweis HE-2020-003045029 (Bedarfsausweis, NWG):
 *   Erdgas H 40,7 + allgemeiner Strommix 80,4 = 121,1 kWh/(m²·a)
 *   -> 33,6 % Gas / 66,4 % Strom.
 */
import { describe, expect, it } from "vitest";
import {
  normalizeExtraction,
  type EnergieausweisExtraction,
} from "@/lib/schema";

function nwg(
  overrides: Partial<EnergieausweisExtraction>,
): EnergieausweisExtraction {
  return {
    gebaeudetyp: "Nichtwohngebäude",
    ausweistyp: "Bedarfsausweis",
    hauptnutzung_gebaeudekategorie: "Büro",
    energietraeger_heizung: ["Erdgas H", "Strom-Mix"],
    nettogrundflaeche_m2: 6121,
    endenergie_je_traeger: [],
    modernisierungsempfehlungen: [],
    ...overrides,
  };
}

describe("Energieträger-Split aus der Endenergietabelle (Seite 2)", () => {
  it("korrigiert invertierte Wärme/Strom-Einzelfelder (Hochheim-Fall)", () => {
    const b = normalizeExtraction(
      nwg({
        // Extraktion hat die Einzelfelder vertauscht (80,4 auf Wärme):
        endenergie_waerme_kwh_m2a: 80.4,
        endenergie_strom_kwh_m2a: 40.7,
        endenergie_gesamt_kwh_m2a: 121.1,
        primaerenergie_kwh_m2a: 233,
        // ... die Tabelle enthält die Wahrheit:
        endenergie_je_traeger: [
          { energietraeger: "Erdgas H", waerme_kwh_m2a: 40.7 },
          { energietraeger: "allgemeiner Strommix", strom_kwh_m2a: 80.4 },
        ],
      }),
    );

    expect(b.heatKwhM2a).toBeCloseTo(40.7);
    expect(b.electricityKwhM2a).toBeCloseTo(80.4);
    expect(b.totalKwhM2a).toBeCloseTo(121.1);

    // Split: 33,6 % Erdgas / 66,4 % Strom (Netzmix)
    const gas = b.perCarrier.find((s) => s.carrier === "erdgas");
    const strom = b.perCarrier.find((s) => s.carrier === "strom_netz");
    expect(gas).toBeDefined();
    expect(strom).toBeDefined();
    expect((gas!.heatKwhM2a / b.totalKwhM2a) * 100).toBeCloseTo(33.6, 0);
    expect((strom!.electricityKwhM2a / b.totalKwhM2a) * 100).toBeCloseTo(66.4, 0);

    // Korrektur wird transparent gemacht (Note + Hinweis-Flag)
    expect(b.notes.some((n) => n.includes("Endenergietabelle"))).toBe(true);
    expect(
      b.flags.some(
        (f) => f.field === "heatKwhM2a" && f.message.includes("korrigiert"),
      ),
    ).toBe(true);

    // Haupt-Wärmeträger bleibt Erdgas (Heizung läuft mit Gas)
    expect(b.heatCarrier).toBe("erdgas");
  });

  it("bucketet nach Trägername, auch wenn Werte in der falschen Spalte stehen", () => {
    const b = normalizeExtraction(
      nwg({
        endenergie_waerme_kwh_m2a: 80.4,
        endenergie_strom_kwh_m2a: 40.7,
        endenergie_je_traeger: [
          // Spalten vertauscht extrahiert – der Trägername entscheidet:
          { energietraeger: "Erdgas H", strom_kwh_m2a: 40.7 },
          { energietraeger: "allgemeiner Strommix", waerme_kwh_m2a: 80.4 },
        ],
      }),
    );
    expect(b.heatKwhM2a).toBeCloseTo(40.7);
    expect(b.electricityKwhM2a).toBeCloseTo(80.4);
  });

  it("übernimmt konsistente Einzelfelder ohne Korrektur-Flag", () => {
    const b = normalizeExtraction(
      nwg({
        endenergie_waerme_kwh_m2a: 61,
        endenergie_strom_kwh_m2a: 24,
        endenergie_gesamt_kwh_m2a: 85,
        endenergie_je_traeger: [
          { energietraeger: "Erdgas", waerme_kwh_m2a: 61 },
          { energietraeger: "Strom (Netzmix)", strom_kwh_m2a: 24 },
        ],
      }),
    );
    expect(b.heatKwhM2a).toBeCloseTo(61);
    expect(b.electricityKwhM2a).toBeCloseTo(24);
    expect(b.flags.some((f) => f.message.includes("korrigiert"))).toBe(false);
  });

  it("ignoriert eine Tabelle, deren Summe nicht zur Gesamt-Endenergie passt", () => {
    const b = normalizeExtraction(
      nwg({
        endenergie_waerme_kwh_m2a: 100,
        endenergie_strom_kwh_m2a: 30,
        endenergie_je_traeger: [
          // Unvollständig gelesene Tabelle (nur eine Zeile, Summe 40 ≠ 130)
          { energietraeger: "Erdgas", waerme_kwh_m2a: 40 },
        ],
      }),
    );
    expect(b.heatKwhM2a).toBeCloseTo(100);
    expect(b.electricityKwhM2a).toBeCloseTo(30);
    expect(b.notes.some((n) => n.includes("ignoriert"))).toBe(true);
  });

  it("nutzt die Tabelle auch, wenn die Einzelfelder komplett fehlen", () => {
    const b = normalizeExtraction(
      nwg({
        endenergie_gesamt_kwh_m2a: 121.1,
        endenergie_je_traeger: [
          { energietraeger: "Erdgas H", waerme_kwh_m2a: 40.7 },
          { energietraeger: "allgemeiner Strommix", strom_kwh_m2a: 80.4 },
        ],
      }),
    );
    expect(b.heatKwhM2a).toBeCloseTo(40.7);
    expect(b.electricityKwhM2a).toBeCloseTo(80.4);
    // Keine 70/30-Näherung nötig
    expect(b.notes.some((n) => n.includes("70/30"))).toBe(false);
  });

  it("fällt ohne Tabelle auf die 70/30-Näherung zurück", () => {
    const b = normalizeExtraction(
      nwg({ endenergie_gesamt_kwh_m2a: 100, endenergie_je_traeger: [] }),
    );
    expect(b.heatKwhM2a).toBeCloseTo(70);
    expect(b.electricityKwhM2a).toBeCloseTo(30);
    expect(b.notes.some((n) => n.includes("70/30"))).toBe(true);
  });

  it("lässt Wohngebäude unverändert (Einzelwert, keine Tabellen-Logik)", () => {
    const b = normalizeExtraction(
      nwg({
        gebaeudetyp: "Wohngebäude",
        gebaeudenutzflaeche_an_m2: 1500,
        endenergie_wg_einzelwert_kwh_m2a: 120,
        endenergie_je_traeger: [
          { energietraeger: "Erdgas", waerme_kwh_m2a: 120 },
        ],
      }),
    );
    expect(b.heatKwhM2a).toBeCloseTo(120);
    expect(b.electricityKwhM2a).toBe(0);
  });
});
