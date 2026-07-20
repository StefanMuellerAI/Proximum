/**
 * Effizienzklassen-Engine (GAP-1, Spez. 2.2) - registry-basiert.
 *
 * DE-WG:  GEG-Tabelle auf Endenergie Heizung + Warmwasser (<=).
 * DE-NWG: Fraunhofer-Methode (DIN EN ISO 52003-1): PE vs. PE_ref;
 *         PE_ref aus Anforderungswert (Bedarfsausweis) oder aus
 *         Vergleichswerten x PEF nach Rechtsgrundlage (Verbrauchsausweis).
 * AT:     HWB bevorzugt, sonst PE (<).
 * PL:     PE, nur Wohngebaeude (<).
 * FR:     Doppelkriterium PE + CO2 je Gebaeudegruppe (schlechtere Klasse).
 *
 * Kein Ergebnis (null) bei Mischgebaeuden und ohne Ausweisdaten
 * (Predium-Verhalten). Nach jeder simulierten Massnahme wird die Klasse
 * neu berechnet (Aufruf aus analyze()).
 */
import { classifyByBands, type ClassBand } from "@/lib/engine/numerics";
import {
  CLASS_SYSTEMS,
  FRAUNHOFER_PEF,
  FRAUNHOFER_PEF_DEFAULT,
  FR_CO2_BANDS,
  type ClassCountry,
  type ClassSystemDef,
  type FrBuildingGroup,
} from "@/lib/data/efficiency-classes";

export interface EfficiencyClassInput {
  country?: ClassCountry;
  gebaeudetyp: "Wohngebäude" | "Nichtwohngebäude";
  /** Mischgebaeude erhalten keine Klasse (Predium-Verhalten). */
  isMixedUse?: boolean;
  ausweistyp: "Bedarfsausweis" | "Verbrauchsausweis";
  /** GEG-/EnEV-Stand-Text des Ausweises (Rechtsgrundlage fuer PEF). */
  gegStand?: string | null;

  /** Endenergie Heizung + Warmwasser (kWh/m2a) - Basis DE-WG. */
  heatEndEnergyKwhM2a?: number | null;
  /** Primaerenergie (kWh/m2a) - Basis Fraunhofer/PL/FR/AT-Fallback. */
  primaryEnergyKwhM2a?: number | null;
  /** Heizwaermebedarf (kWh/m2a) - AT bevorzugt. */
  hwbKwhM2a?: number | null;
  /** CO2-Intensitaet (kg/m2a) - FR-Doppelkriterium. */
  co2KgM2a?: number | null;

  /** NWG-Fraunhofer: PE-Anforderungswert direkt aus dem Bedarfsausweis. */
  peRefKwhM2a?: number | null;
  /** NWG-Fraunhofer (Verbrauchsausweis): Endenergie-Vergleichswerte. */
  vergleichswertWaerme?: number | null;
  vergleichswertStrom?: number | null;

  /** FR: Gebaeudegruppe fuer die CO2-Grenzen (Default aus Gebaeudetyp). */
  frGroup?: FrBuildingGroup;
}

export interface EfficiencyClassResult {
  label: string;
  systemId: string;
  /** Menschlich lesbare Herleitung (fuer UI/Report). */
  basis: string;
  /** Fraunhofer: verwendeter Referenzwert PE_ref (kWh/m2a). */
  peRefKwhM2a?: number;
}

function findSystem(
  country: ClassCountry,
  scope: "WG" | "NWG",
): ClassSystemDef | null {
  return (
    CLASS_SYSTEMS.find(
      (s) => s.country === country && (s.scope === scope || s.scope === "ALL"),
    ) ?? null
  );
}

/** PE_ref fuer die Fraunhofer-Methode bestimmen (Spez. 2.2). */
export function fraunhoferPeRef(input: {
  ausweistyp: "Bedarfsausweis" | "Verbrauchsausweis";
  gegStand?: string | null;
  peRefKwhM2a?: number | null;
  vergleichswertWaerme?: number | null;
  vergleichswertStrom?: number | null;
}): { peRef: number; basis: string } | null {
  // Bedarfsausweis: GEG-Anforderungswert direkt aus dem Ausweis
  if (input.peRefKwhM2a != null && input.peRefKwhM2a > 0)
    return {
      peRef: input.peRefKwhM2a,
      basis: `PE_ref = Anforderungswert ${input.peRefKwhM2a} kWh/m²a (Ausweis)`,
    };

  // Verbrauchsausweis: Vergleichswerte x PEF nach Rechtsgrundlage
  if (
    input.vergleichswertWaerme != null &&
    input.vergleichswertStrom != null &&
    input.vergleichswertWaerme > 0
  ) {
    const stand = input.gegStand ?? "";
    const pef =
      FRAUNHOFER_PEF.find((p) => p.match.test(stand)) ?? FRAUNHOFER_PEF_DEFAULT;
    const peRef =
      input.vergleichswertWaerme * pef.waerme +
      input.vergleichswertStrom * pef.strom;
    return {
      peRef,
      basis: `PE_ref = ${input.vergleichswertWaerme}·${pef.waerme} + ${input.vergleichswertStrom}·${pef.strom} = ${Math.round(peRef)} kWh/m²a (${pef.basis})`,
    };
  }
  return null;
}

/** Fraunhofer-Klassifizierung PE vs. PE_ref (DIN EN ISO 52003-1). */
export function fraunhoferClass(
  pe: number,
  peRef: number,
): string {
  const system = CLASS_SYSTEMS.find((s) => s.id === "DE_NWG_FRAUNHOFER")!;
  const absoluteBands: ClassBand[] = system.bands.map((b) => ({
    label: b.label,
    max: b.max === null ? null : b.max * peRef,
  }));
  return classifyByBands(pe, absoluteBands, system.boundary);
}

const CLASS_ORDER = ["A++", "A+", "A", "B", "C", "D", "E", "F", "G", "H"];

/** Schlechtere von zwei Klassen (FR-Doppelkriterium). */
export function worseClass(a: string, b: string): string {
  return CLASS_ORDER.indexOf(a) >= CLASS_ORDER.indexOf(b) ? a : b;
}

/**
 * Berechnet die Effizienzklasse nach dem Klassensystem des Landes.
 * null = keine Klasse berechenbar (Mischgebaeude, fehlende Daten,
 * kein Klassensystem fuer den Gebaeudetyp).
 */
export function computeEfficiencyClass(
  input: EfficiencyClassInput,
): EfficiencyClassResult | null {
  if (input.isMixedUse) return null;
  const country = input.country ?? "DE";
  const scope = input.gebaeudetyp === "Wohngebäude" ? "WG" : "NWG";
  const system = findSystem(country, scope);
  if (!system) return null;

  switch (system.metric) {
    case "heat_end_energy": {
      const v = input.heatEndEnergyKwhM2a;
      if (v == null || v <= 0) return null;
      return {
        label: classifyByBands(v, system.bands, system.boundary),
        systemId: system.id,
        basis: `Endenergie Heizung + Warmwasser ${Math.round(v)} kWh/m²a (${system.source})`,
      };
    }

    case "pe_relative": {
      const pe = input.primaryEnergyKwhM2a;
      if (pe == null || pe <= 0) return null;
      const ref = fraunhoferPeRef(input);
      if (!ref) return null;
      return {
        label: fraunhoferClass(pe, ref.peRef),
        systemId: system.id,
        basis: `PE ${Math.round(pe)} kWh/m²a vs. ${ref.basis}`,
        peRefKwhM2a: ref.peRef,
      };
    }

    case "hwb_or_pe": {
      const v = input.hwbKwhM2a ?? input.primaryEnergyKwhM2a;
      if (v == null || v <= 0) return null;
      const metric = input.hwbKwhM2a != null ? "HWB" : "Primärenergie";
      return {
        label: classifyByBands(v, system.bands, system.boundary),
        systemId: system.id,
        basis: `${metric} ${Math.round(v)} kWh/m²a (${system.source})`,
      };
    }

    case "primary_energy": {
      const pe = input.primaryEnergyKwhM2a;
      if (pe == null || pe <= 0) return null;
      let label = classifyByBands(pe, system.bands, system.boundary);
      let basis = `Primärenergie ${Math.round(pe)} kWh/m²a (${system.source})`;

      // FR-Doppelkriterium: schlechtere Klasse aus PE und CO2 je Gruppe
      if (country === "FR" && input.co2KgM2a != null) {
        const group: FrBuildingGroup =
          input.frGroup ?? (input.gebaeudetyp === "Wohngebäude" ? 1 : 2);
        const co2Label = classifyByBands(
          input.co2KgM2a,
          FR_CO2_BANDS[group],
          "lte",
        );
        const combined = worseClass(label, co2Label);
        if (combined !== label)
          basis += ` · CO₂-Kriterium (Gruppe ${group}): ${co2Label} → maßgeblich`;
        label = combined;
      }

      return { label, systemId: system.id, basis };
    }
  }
}

/** Erkennung von Mischnutzung aus dem Freitext der Hauptnutzung. */
export function isMixedUse(hauptnutzung: string | null | undefined): boolean {
  const t = (hauptnutzung ?? "").toLowerCase();
  return t.includes("misch") || t.includes("gemischt") || t.includes("mixed");
}
