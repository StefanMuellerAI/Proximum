import { TAXONOMY } from "@/lib/data/reference";
import type { TaxonomyResult } from "@/lib/engine/types";

/**
 * Vereinfachte EU-Taxonomie-Pruefung (Klimaschutz, Gebaeudebetrieb).
 * MVP-Naeherung: aligned, wenn EPC-Klasse A(+) ODER Primaerenergie <= Schwelle
 * (strengere NZEB-Schwelle bei Baujahr ab 2021).
 */
export function computeTaxonomy(
  primaryKwhM2a: number | null,
  epcClass: string | null,
  baujahr: number | null,
): TaxonomyResult {
  const isNewBuild = baujahr != null && baujahr >= 2021;
  const threshold = isNewBuild
    ? TAXONOMY.pedThresholdNzebKwhM2a
    : TAXONOMY.pedThresholdKwhM2a;

  if (epcClass && TAXONOMY.alignedEpcClasses.includes(epcClass.toUpperCase())) {
    return {
      aligned: true,
      criterion: "EPC-Klasse",
      detail: `Energieeffizienzklasse ${epcClass} zählt als taxonomiekonform.`,
      thresholdKwhM2a: threshold,
      primaryKwhM2a,
    };
  }

  if (primaryKwhM2a == null) {
    return {
      aligned: false,
      criterion: "Primärenergie",
      detail:
        "Kein Primärenergiewert im Ausweis – Alignment nicht belegbar (Näherung).",
      thresholdKwhM2a: threshold,
      primaryKwhM2a,
    };
  }

  const aligned = primaryKwhM2a <= threshold;
  return {
    aligned,
    criterion: isNewBuild ? "Primärenergie (NZEB)" : "Primärenergie (Top-15%-Näherung)",
    detail: aligned
      ? `Primärenergie ${Math.round(primaryKwhM2a)} ≤ ${threshold} kWh/(m²·a) – Näherung erfüllt.`
      : `Primärenergie ${Math.round(primaryKwhM2a)} > ${threshold} kWh/(m²·a) – Schwelle nicht erreicht.`,
    thresholdKwhM2a: threshold,
    primaryKwhM2a,
  };
}
