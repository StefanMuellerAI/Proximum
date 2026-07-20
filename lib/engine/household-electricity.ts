/**
 * Haushaltsstrom-Modell Wohngebaeude (GAP-15, Spez. 1.4b):
 *
 * Bedarfsbasierte CRREM-Analysen von Wohngebaeuden unterschlagen den
 * Haushaltsstrom (der Ausweis enthaelt ihn nicht) - eine systematische
 * Unterschaetzung, die Predium selbst einraeumt. Proximum ergaenzt einen
 * AUSGEWIESENEN Default statt die Luecke zu erben: der Zuschlag ist im
 * Ergebnis als householdElectricityAddedKwhM2a sichtbar und im Report
 * als Annahme dokumentiert.
 *
 * Durchschnittswerte (dena-Gebaeudereport/BDEW-Zonierung, dokumentierte
 * Naeherung): EFH ~ 30, MFH ~ 25 kWh/m2 Wohnflaeche und Jahr.
 */
import type { CrremType } from "@/lib/data/reference";
import { CARRIERS } from "@/lib/data/reference";
import type { EnergyState } from "@/lib/engine/types";

export const HOUSEHOLD_ELECTRICITY_KWH_M2A: Partial<Record<CrremType, number>> = {
  RSF: 30,
  RMF: 25,
};

export const HOUSEHOLD_ELECTRICITY_SOURCE =
  "dena-Gebäudereport / BDEW-Haushaltsstrom-Durchschnittswerte (dokumentierte Näherung)";

/** Default fuer ein Gebaeude; 0 = kein Zuschlag (NWG oder Strom erfasst). */
export function householdElectricityDefault(building: {
  gebaeudetyp: "Wohngebäude" | "Nichtwohngebäude";
  crremType: CrremType;
  electricityKwhM2a: number;
}): number {
  if (building.gebaeudetyp !== "Wohngebäude") return 0;
  // Nur ergaenzen, wenn der Ausweis keinen Strom erfasst (Stromluecke)
  if (building.electricityKwhM2a > 0) return 0;
  return HOUSEHOLD_ELECTRICITY_KWH_M2A[building.crremType] ?? 25;
}

/**
 * Ergaenzt den Energiezustand um den Haushaltsstrom-Default (Netzstrom).
 * Liefert den Zuschlag mit, damit UI/Report ihn AUSWEISEN koennen.
 */
export function withHouseholdElectricity(
  state: EnergyState,
  building: {
    gebaeudetyp: "Wohngebäude" | "Nichtwohngebäude";
    crremType: CrremType;
    electricityKwhM2a: number;
  },
): { state: EnergyState; addedKwhM2a: number } {
  const added = householdElectricityDefault(building);
  if (added <= 0) return { state, addedKwhM2a: 0 };
  return {
    state: {
      heatKwhM2a: state.heatKwhM2a,
      electricityKwhM2a: state.electricityKwhM2a + added,
      perCarrier: [
        ...state.perCarrier.map((s) => ({ ...s })),
        {
          carrier: "strom_netz" as const,
          label: `${CARRIERS.strom_netz.label} (Haushaltsstrom-Default)`,
          heatKwhM2a: 0,
          electricityKwhM2a: added,
        },
      ],
    },
    addedKwhM2a: added,
  };
}
