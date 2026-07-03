/**
 * Vereinfachtes Transmissionsmodell der Gebaeudehuelle.
 *
 * Zweck: Die Waermeeinsparung einer Huellen-Massnahme (Fenster/Wand/Dach/Boden)
 * WWR-abhaengig statt pauschal zu bestimmen. Kein DIN V 18599, sondern eine
 * dokumentierte, WWR-sensitive Heuristik.
 *
 * Idee: Ein fester Anteil der Heiz-Endenergie geht ueber Transmission verloren.
 * Dieser Verlust verteilt sich auf die Bauteile proportional zu (Flaeche × U-Wert).
 * Eine Massnahme senkt den Verlust ihres Bauteils um (1 − U_neu/U_alt).
 */
import { U_VALUES, type EnvelopeComponent } from "@/lib/data/reference";

/** Anteil der Heiz-Endenergie, der ueber die Huelle (Transmission) verloren geht. */
const TRANSMISSION_SHARE = 0.7;

// Kompaktheits-/Geometrie-Faktoren: Bauteilflaeche je m² Bezugsflaeche (Naeherung).
const FACADE_FACTOR = 0.8; // Fassade (Wand + Fenster)
const ROOF_FACTOR = 0.5;
const FLOOR_FACTOR = 0.5;

/** UA-Gewichte (Flaeche × U_alt) je Bauteil fuer einen gegebenen WWR. */
function uaWeights(wwrPercent: number): Record<EnvelopeComponent, number> {
  const wwr = Math.min(0.9, Math.max(0, wwrPercent / 100));
  return {
    window: FACADE_FACTOR * wwr * U_VALUES.window.alt,
    wall: FACADE_FACTOR * (1 - wwr) * U_VALUES.wall.alt,
    roof: ROOF_FACTOR * U_VALUES.roof.alt,
    floor: FLOOR_FACTOR * U_VALUES.floor.alt,
  };
}

/** Anteil eines Bauteils am gesamten Transmissionsverlust (0..1). */
export function componentLossShare(
  component: EnvelopeComponent,
  wwrPercent: number,
): number {
  const w = uaWeights(wwrPercent);
  const total = w.window + w.wall + w.roof + w.floor;
  return total > 0 ? w[component] / total : 0;
}

/**
 * Relative Minderung der Heiz-Endenergie durch Sanierung eines Bauteils.
 * = Transmissionsanteil × Bauteilanteil × (1 − U_neu/U_alt).
 */
export function envelopeHeatReduction(
  component: EnvelopeComponent,
  wwrPercent: number,
): number {
  const share = componentLossShare(component, wwrPercent);
  const u = U_VALUES[component];
  const improvement = 1 - u.neu / u.alt;
  return TRANSMISSION_SHARE * share * improvement;
}

/**
 * Tageslicht-Faktor fuer die Beleuchtungs-Einsparung: mehr Fensterflaeche ->
 * mehr Tageslicht -> geringeres zusaetzliches LED-Einsparpotenzial.
 */
export function daylightFactor(wwrPercent: number): number {
  return Math.max(0.6, 1 - 0.4 * Math.min(0.9, wwrPercent / 100));
}
