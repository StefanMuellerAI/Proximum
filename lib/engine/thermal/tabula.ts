/**
 * TABULA/IWU-Datenanreicherung (Spez. 2.1): baujahresabhaengige Defaults
 * fuer Bauteilaufbauten, wenn der Nutzer nichts eingibt.
 *
 * Quellen: IWU Deutsche Wohngebaeudetypologie 2011/2015 (TABULA),
 * Bundesanzeiger-Vergleichswerte (NWG). Werte sind dokumentierte
 * Naeherungen je Baualtersklasse (Grundkonstruktion als Ersatzschicht
 * d/lambda, die den typischen U-Wert reproduziert).
 *
 * Fehlende Eingaben (IWU-Gebaeudetypologie 2011):
 *   Baujahr:      WG 1963, NWG 1978
 *   Nutzungsart:  MFH
 *   Energietraeger: Erdgas
 *   EBF:          aus 3D-Volumen mit Stockwerkshoehe 2,5 m
 */
import type { Layer } from "@/lib/engine/thermal/u-value";

export const DEFAULT_BAUJAHR_WG = 1963;
export const DEFAULT_BAUJAHR_NWG = 1978;
export const DEFAULT_STOREY_HEIGHT_M = 2.5;

export interface AgeClassDefaults {
  /** Untere Grenze der Baualtersklasse (inklusive). */
  fromYear: number;
  /** Ersatz-Grundkonstruktion Aussenwand. */
  wall: Layer;
  /** Ersatz-Grundkonstruktion Dach / oberste Geschossdecke. */
  roof: Layer;
  /** Ersatz-Grundkonstruktion Kellerdecke. */
  floor: Layer;
  /** Fenster: direkter Uw (W/m2K). */
  windowU: number;
  /** Infiltrations-Luftwechselrate n_inf (1/h). */
  infiltrationAch: number;
}

/**
 * TABULA-Baualtersklassen (DE), Ersatzschichten so gewaehlt, dass die
 * U-Werte den typischen TABULA-Bestandswerten entsprechen
 * (z. B. Wand B (1919-48): U ~ 1,7; Wand F (1969-78): U ~ 1,0).
 */
export const TABULA_AGE_CLASSES: AgeClassDefaults[] = [
  {
    fromYear: 0, // bis 1918
    wall: { thicknessM: 0.38, lambdaWmK: 0.8 }, // Vollziegel ~ U 1,7
    roof: { thicknessM: 0.16, lambdaWmK: 0.13 }, // Holzbalken, kaum gedaemmt
    floor: { thicknessM: 0.16, lambdaWmK: 0.35 },
    windowU: 2.8,
    infiltrationAch: 0.7,
  },
  {
    fromYear: 1919,
    wall: { thicknessM: 0.38, lambdaWmK: 0.75 },
    roof: { thicknessM: 0.18, lambdaWmK: 0.15 },
    floor: { thicknessM: 0.16, lambdaWmK: 0.35 },
    windowU: 2.8,
    infiltrationAch: 0.7,
  },
  {
    fromYear: 1949,
    wall: { thicknessM: 0.3, lambdaWmK: 0.5 }, // Hochlochziegel ~ U 1,4
    roof: { thicknessM: 0.18, lambdaWmK: 0.18 },
    floor: { thicknessM: 0.18, lambdaWmK: 0.4 },
    windowU: 2.8,
    infiltrationAch: 0.6,
  },
  {
    fromYear: 1958,
    wall: { thicknessM: 0.3, lambdaWmK: 0.45 },
    roof: { thicknessM: 0.2, lambdaWmK: 0.2 },
    floor: { thicknessM: 0.18, lambdaWmK: 0.4 },
    windowU: 2.8,
    infiltrationAch: 0.6,
  },
  {
    fromYear: 1969,
    wall: { thicknessM: 0.3, lambdaWmK: 0.4 }, // ~ U 1,0
    roof: { thicknessM: 0.22, lambdaWmK: 0.16 },
    floor: { thicknessM: 0.2, lambdaWmK: 0.35 },
    windowU: 2.6,
    infiltrationAch: 0.55,
  },
  {
    fromYear: 1979, // 1. WSchV 1977
    wall: { thicknessM: 0.3, lambdaWmK: 0.28 }, // ~ U 0,8
    roof: { thicknessM: 0.24, lambdaWmK: 0.12 },
    floor: { thicknessM: 0.2, lambdaWmK: 0.3 },
    windowU: 2.6,
    infiltrationAch: 0.5,
  },
  {
    fromYear: 1984, // 2. WSchV 1984
    wall: { thicknessM: 0.32, lambdaWmK: 0.22 }, // ~ U 0,6
    roof: { thicknessM: 0.26, lambdaWmK: 0.1 },
    floor: { thicknessM: 0.22, lambdaWmK: 0.25 },
    windowU: 2.7,
    infiltrationAch: 0.45,
  },
  {
    fromYear: 1995, // 3. WSchV 1995
    wall: { thicknessM: 0.34, lambdaWmK: 0.17 }, // ~ U 0,5
    roof: { thicknessM: 0.28, lambdaWmK: 0.09 },
    floor: { thicknessM: 0.24, lambdaWmK: 0.2 },
    windowU: 1.8,
    infiltrationAch: 0.4,
  },
  {
    fromYear: 2002, // EnEV 2002
    wall: { thicknessM: 0.36, lambdaWmK: 0.13 }, // ~ U 0,35
    roof: { thicknessM: 0.3, lambdaWmK: 0.075 },
    floor: { thicknessM: 0.26, lambdaWmK: 0.18 },
    windowU: 1.4,
    infiltrationAch: 0.35,
  },
  {
    fromYear: 2010, // EnEV 2009
    wall: { thicknessM: 0.38, lambdaWmK: 0.1 }, // ~ U 0,25
    roof: { thicknessM: 0.32, lambdaWmK: 0.065 },
    floor: { thicknessM: 0.28, lambdaWmK: 0.16 },
    windowU: 1.3,
    infiltrationAch: 0.3,
  },
  {
    fromYear: 2016, // EnEV 2016 / GEG
    wall: { thicknessM: 0.4, lambdaWmK: 0.08 }, // ~ U 0,2
    roof: { thicknessM: 0.34, lambdaWmK: 0.055 },
    floor: { thicknessM: 0.3, lambdaWmK: 0.14 },
    windowU: 1.1,
    infiltrationAch: 0.3,
  },
];

/** Defaults der Baualtersklasse eines Baujahrs. */
export function ageClassDefaults(baujahr: number): AgeClassDefaults {
  let result = TABULA_AGE_CLASSES[0];
  for (const c of TABULA_AGE_CLASSES) {
    if (baujahr >= c.fromYear) result = c;
  }
  return result;
}

/**
 * Erzeuger-Aufwandszahlen e (Endenergie / Nutzenergie) nach EN 15316
 * Level B (tabellierte Naeherungen je Traeger).
 */
export const EXPENDITURE_FACTORS: Record<string, number> = {
  erdgas: 1.08, // Brennwert-/NT-Mix Bestand
  biomethan: 1.08, // wie Erdgas (gleiche Kesseltechnik)
  fluessiggas: 1.1,
  heizoel: 1.15,
  steinkohle: 1.3,
  braunkohle: 1.35,
  holz: 1.25,
  fernwaerme_kwk: 1.02,
  fernwaerme_fossil: 1.02,
  nahwaerme: 1.05,
  strom_netz: 1.0, // Direktheizung
  strom_gruen: 1.0,
  waermepumpe: 0.29, // JAZ ~ 3,5
  solarthermie: 1.0,
  abwaerme: 1.0,
  sonstige: 1.1,
};
