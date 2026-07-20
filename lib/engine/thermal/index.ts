/**
 * Thermisches Gebaeudemodell (GAP-2): oeffentliche Modul-API.
 *
 * Zielarchitektur (Spez. 2.1 + Kap. 5): Bottom-up-Modell PARALLEL zum
 * Top-down-Heuristik-Pfad (lib/engine/envelope.ts). Feature-Flag je
 * Gebaeude: erfolgreich skaliert -> bauteilscharfe Massnahmenwirkung,
 * sonst Fallback auf die Heuristik. Scheitert die Skalierung, ist die
 * Massnahmenplanung zu sperren (UI-Hinweis).
 */
export * from "@/lib/engine/thermal/u-value";
export * from "@/lib/engine/thermal/tabula";
export * from "@/lib/engine/thermal/model";

import type { NormalizedBuilding } from "@/lib/schema";
import {
  buildThermalModel,
  calibrate,
  measureHeatReduction,
  type CalibrationResult,
} from "@/lib/engine/thermal/model";
import { INSULATION_LAMBDA, GEG_ANLAGE7_UMAX } from "@/lib/engine/thermal/u-value";
import type { EnvelopeComponent } from "@/lib/data/reference";

export interface ThermalAnalysis {
  calibration: CalibrationResult;
  /**
   * Bauteilscharfe Waermeminderung je Huellmassnahme (0..1) aus dem
   * kalibrierten Modell - ersetzt bei Erfolg die Pauschal-Heuristik.
   */
  envelopeReductions: Partial<Record<EnvelopeComponent, number>> | null;
}

/** Sanierungsstandard der Massnahmen (GEG Anlage 7 als Referenz). */
const MEASURE_UPGRADES: Record<
  EnvelopeComponent,
  { component: "wand" | "dach" | "kellerdecke" | "fenster"; insulation?: { thicknessM: number; lambdaWmK: number }; windowU?: number }
> = {
  wall: {
    component: "wand",
    insulation: { thicknessM: 0.16, lambdaWmK: INSULATION_LAMBDA.eps },
  },
  roof: {
    component: "dach",
    insulation: { thicknessM: 0.2, lambdaWmK: INSULATION_LAMBDA.mineralwolle },
  },
  floor: {
    component: "kellerdecke",
    insulation: { thicknessM: 0.1, lambdaWmK: INSULATION_LAMBDA.eps },
  },
  window: { component: "fenster", windowU: GEG_ANLAGE7_UMAX.fenster * 0.7 }, // 3-fach ~ 0,9
};

/**
 * Bottom-up-Analyse eines Gebaeudes: Modell aufbauen, auf den Ausweiswert
 * kalibrieren, bauteilscharfe Massnahmenwirkungen ableiten.
 * null = nicht anwendbar (keine Flaeche/kein Waermebedarf im Ausweis).
 */
export function analyzeThermal(
  building: NormalizedBuilding,
): ThermalAnalysis | null {
  if (
    building.bezugsflaecheM2 == null ||
    building.bezugsflaecheM2 <= 0 ||
    building.heatKwhM2a <= 0
  )
    return null;

  const model = buildThermalModel({
    gebaeudetyp: building.gebaeudetyp,
    baujahr: building.baujahr,
    bezugsflaecheM2: building.bezugsflaecheM2,
    wwrPercent: building.wwrPercent,
    heatCarrier: building.heatCarrier,
  });

  const calibration = calibrate(model, building.heatKwhM2a);

  let envelopeReductions: Partial<Record<EnvelopeComponent, number>> | null =
    null;
  if (calibration.success) {
    envelopeReductions = {};
    for (const [key, upgrade] of Object.entries(MEASURE_UPGRADES) as [
      EnvelopeComponent,
      (typeof MEASURE_UPGRADES)[EnvelopeComponent],
    ][]) {
      envelopeReductions[key] = measureHeatReduction(
        calibration.model,
        upgrade.component,
        { insulation: upgrade.insulation, windowU: upgrade.windowU },
      );
    }
  }

  return { calibration, envelopeReductions };
}
