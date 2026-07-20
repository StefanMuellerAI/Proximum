/**
 * U-Wert-Engine nach DIN EN ISO 6946 (Spez. 2.1) - Predium-Vereinfachung
 * mit genau ZWEI Schichten (Grundkonstruktion + Daemmung):
 *
 *   R = d / lambda        U = 1 / (R_si + R_Grund + R_Daemmung + R_se)
 *
 * Der U-Wert ist NIE direkt editierbar, nur ueber d und lambda.
 * Neue Daemmung ERSETZT Bestandsdaemmung (nicht additiv, Spez. 2.9).
 */

export type ComponentType =
  | "wand"
  | "dach"
  | "kellerdecke"
  | "oberste_geschossdecke"
  | "fenster"
  | "tuer";

/**
 * Waermeuebergangswiderstaende R_si/R_se (m2K/W) je Bauteillage
 * (DIN EN ISO 6946, Normwerte: horizontal 0,13/0,04; aufwaerts 0,10/0,04;
 * abwaerts bzw. an unbeheizt/Erdreich 0,17/0,17).
 */
export const SURFACE_RESISTANCES: Record<
  ComponentType,
  { rsi: number; rse: number }
> = {
  wand: { rsi: 0.13, rse: 0.04 },
  dach: { rsi: 0.1, rse: 0.04 },
  oberste_geschossdecke: { rsi: 0.1, rse: 0.1 }, // an unbeheizten Dachraum
  kellerdecke: { rsi: 0.17, rse: 0.17 }, // an unbeheizten Keller
  fenster: { rsi: 0.13, rse: 0.04 },
  tuer: { rsi: 0.13, rse: 0.04 },
};

/** Referenz-Waermeleitfaehigkeiten der Daemmstoffe (W/mK, Spez. 2.1). */
export const INSULATION_LAMBDA = {
  eps: 0.035,
  mineralwolle: 0.04,
  holzfaser: 0.045,
} as const;

/**
 * GEG Anlage 7: U-Hoechstwerte bei Aenderung von Aussenbauteilen
 * (Sanierungs-Referenz fuer Massnahmen, W/m2K).
 */
export const GEG_ANLAGE7_UMAX: Record<ComponentType, number> = {
  wand: 0.24,
  dach: 0.24,
  oberste_geschossdecke: 0.24,
  kellerdecke: 0.3,
  fenster: 1.3,
  tuer: 1.8,
};

export interface Layer {
  /** Dicke in Metern. */
  thicknessM: number;
  /** Waermeleitfaehigkeit in W/(m*K). */
  lambdaWmK: number;
}

/** Waermedurchlasswiderstand einer Schicht: R = d / lambda. */
export function layerResistance(layer: Layer): number {
  if (layer.lambdaWmK <= 0) return 0;
  return layer.thicknessM / layer.lambdaWmK;
}

/**
 * U-Wert eines opaken Bauteils aus Grundkonstruktion + optionaler Daemmung.
 * Fenster/Tueren haben direkte Uw-Werte (kein Schichtaufbau).
 */
export function uValue(
  type: ComponentType,
  base: Layer,
  insulation: Layer | null,
): number {
  const { rsi, rse } = SURFACE_RESISTANCES[type];
  const r =
    rsi + layerResistance(base) + (insulation ? layerResistance(insulation) : 0) + rse;
  return 1 / r;
}
