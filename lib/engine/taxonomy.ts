import {
  TAXONOMY,
  TAXONOMY_PED_TOP15,
  TAXONOMY_PED_TOP30,
  taxonomyNzebThreshold,
  STOCK_PERCENTILE_ANCHORS,
  type CrremType,
} from "@/lib/data/reference";
import type { TaxonomyResult } from "@/lib/engine/types";
import type { RiskResult, RiskLevel, Timeframe } from "@/lib/risk";

/**
 * Perzentil-Einordnung im nationalen Bestand (Naeherung):
 * "Das Gebaeude gehoert zu den besten ~X % bzgl. Primaerenergiebedarf."
 * Stueckweise lineare Interpolation zwischen dokumentierten Ankern
 * (STOCK_PERCENTILE_ANCHORS), skaliert ueber die nutzungsspezifische
 * Top-15%-Schwelle. Ergebnis auf 1..99 % geklemmt und auf 5 % gerundet
 * (mehr Genauigkeit gibt die Datenlage nicht her).
 */
export function estimateStockPercentile(
  primaryKwhM2a: number | null,
  crremType: CrremType,
): number | null {
  if (primaryKwhM2a == null || primaryKwhM2a <= 0) return null;
  const top15 = TAXONOMY_PED_TOP15[crremType];
  const factor = primaryKwhM2a / top15;

  const anchors = STOCK_PERCENTILE_ANCHORS;
  let percentile: number;
  if (factor <= anchors[0].factorOfTop15) {
    percentile = anchors[0].percentile;
  } else if (factor >= anchors[anchors.length - 1].factorOfTop15) {
    percentile = anchors[anchors.length - 1].percentile;
  } else {
    percentile = anchors[anchors.length - 1].percentile;
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1];
      const b = anchors[i];
      if (factor <= b.factorOfTop15) {
        const t =
          (factor - a.factorOfTop15) / (b.factorOfTop15 - a.factorOfTop15);
        percentile = a.percentile + t * (b.percentile - a.percentile);
        break;
      }
    }
  }
  const rounded = Math.round(percentile / 5) * 5;
  return Math.min(99, Math.max(1, rounded === 0 ? 1 : rounded));
}

/**
 * EU-Taxonomie-Pruefung "Substantial Contribution Klimaschutz"
 * (Delegierte VO (EU) 2021/2139, Anhang I, 7.7):
 *  - Neubau (ab 2021): PED mind. 10 % unter NZEB -> nutzungsspezifische
 *    NZEB-Schwelle (Naeherung).
 *  - Bestand: EPC-Klasse A(+) ODER Top-15 % des nationalen Bestands ->
 *    nutzungsspezifische PED-Schwelle (dokumentierte Naeherung).
 * Regelbasierte Naeherung – kein Ersatz fuer eine testierte Taxonomie-Pruefung.
 */
export function computeTaxonomy(
  primaryKwhM2a: number | null,
  epcClass: string | null,
  baujahr: number | null,
  crremType?: CrremType,
): TaxonomyResult {
  // Bestandskriterium nur Baujahr <= 2020; Neubau ab 2021: >= 10 % unter NZEB
  const isNewBuild = baujahr != null && baujahr >= 2021;
  const threshold = crremType
    ? isNewBuild
      ? taxonomyNzebThreshold(crremType)
      : TAXONOMY_PED_TOP15[crremType]
    : isNewBuild
      ? TAXONOMY.pedThresholdNzebKwhM2a
      : TAXONOMY.pedThresholdKwhM2a;
  // Top 30 % = "DNSH erfuellt" (nur Bestand, Spez. 2.12)
  const top30Threshold =
    crremType && !isNewBuild ? TAXONOMY_PED_TOP30[crremType] : undefined;
  const top30Met =
    top30Threshold != null && primaryKwhM2a != null
      ? primaryKwhM2a <= top30Threshold
      : undefined;

  if (epcClass && TAXONOMY.alignedEpcClasses.includes(epcClass.toUpperCase())) {
    return {
      aligned: true,
      criterion: "EPC-Klasse",
      detail: `Energieeffizienzklasse ${epcClass} zählt als taxonomiekonform (Anhang I 7.7).`,
      thresholdKwhM2a: threshold,
      primaryKwhM2a,
      top30ThresholdKwhM2a: top30Threshold,
      top30Met: top30Met ?? true,
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
      top30ThresholdKwhM2a: top30Threshold,
      top30Met,
    };
  }

  const aligned = primaryKwhM2a <= threshold;
  const criterion = isNewBuild
    ? "Primärenergie (NZEB −10 %, Neubau ab 2021)"
    : crremType
      ? `Primärenergie (Top 15 % „Wesentlicher Beitrag", ${crremType})`
      : "Primärenergie (Top-15%-Schwelle)";
  const top30Suffix =
    top30Threshold != null && !aligned
      ? top30Met
        ? ` Top 30 % (≤ ${top30Threshold}) erreicht – „DNSH erfüllt".`
        : ` Auch Top 30 % (≤ ${top30Threshold}) verfehlt.`
      : "";
  return {
    aligned,
    criterion,
    detail: aligned
      ? `Primärenergie ${Math.round(primaryKwhM2a)} ≤ ${threshold} kWh/(m²·a) – Top-15%-Schwelle (${TAXONOMY.version}) erfüllt („Wesentlicher Beitrag").`
      : `Primärenergie ${Math.round(primaryKwhM2a)} > ${threshold} kWh/(m²·a) – Top-15%-Schwelle (${TAXONOMY.version}) nicht erreicht.${top30Suffix}`,
    thresholdKwhM2a: threshold,
    primaryKwhM2a,
    top30ThresholdKwhM2a: top30Threshold,
    top30Met,
  };
}

// ---------------------------------------------------------------------------
// DNSH "Anpassung an den Klimawandel" (Anhang I, Anlage A)
// ---------------------------------------------------------------------------

export interface DnshFinding {
  gruppe: string;
  label: string;
  level: RiskLevel;
  timeframe: Timeframe;
  anzeigewert: number;
  /** Erforderliche/empfohlene Anpassungsmassnahme fuer diese Gefahr. */
  adaptationMeasure: string;
}

export type DnshStatus =
  | "konform"
  | "massnahmen_erforderlich"
  | "nicht_bewertbar";

export interface DnshResult {
  status: DnshStatus;
  detail: string;
  /** Hohe/sehr hohe ZUKUNFTS-Gefaehrdungen mit Anpassungsmassnahme. */
  findings: DnshFinding[];
  /** Anzahl ausgewerteter Gefahren (Klimarisiko-Screening). */
  assessedHazardCount: number;
}

/** Anpassungsmassnahmen je Gefahrengruppe (GIS ImmoRisk Naturgefahren). */
const ADAPTATION_BY_GROUP: Record<string, string> = {
  Hitze:
    "Außenliegender Sonnenschutz, Nachtlüftung/passive Kühlung, Begrünung; Überhitzungsschutz im Betrieb nachweisen",
  Waldbrand:
    "Brandresistente Außenmaterialien, Freihaltezonen um das Gebäude, Funkenflug-Schutz an Öffnungen",
  Wintersturm:
    "Sturmsicherung von Dacheindeckung und Fassadenelementen, regelmäßige Dachinspektion",
  Hagel:
    "Hagelresistente Dachdeckung/Oberlichter (Hagelwiderstandsklasse), Schutz außenliegender Anlagen",
  Blitzschlag:
    "Blitzschutzanlage (DIN EN 62305) errichten/prüfen, Überspannungsschutz",
  Starkregen:
    "Rückstausicherung, Außenentwässerung/Retention, Abdichtung tieferliegender Öffnungen",
  Schneelast:
    "Dachstatik auf erhöhte Schneelasten prüfen, Schneefang, Räumkonzept",
  Erdbeben:
    "Standsicherheit nach DIN EN 1998 (Eurocode 8) prüfen, ggf. Aussteifung nachrüsten",
};

/**
 * DNSH-Kriterium "Anpassung an den Klimawandel" auf Basis des bereits
 * durchgefuehrten Klimarisiko-Screenings (28 Gefahren, GIS ImmoRisk):
 * hohe/sehr hohe ZUKUNFTS-Gefaehrdungen erfordern Anpassungsmassnahmen.
 */
export function computeDnshAdaptation(risk: RiskResult | null): DnshResult {
  if (!risk || risk.hazards.length === 0) {
    return {
      status: "nicht_bewertbar",
      detail:
        "Kein Klimarisiko-Screening verfügbar – DNSH „Anpassung an den Klimawandel“ nicht bewertbar.",
      findings: [],
      assessedHazardCount: 0,
    };
  }

  const future = risk.hazards.filter(
    (h) => h.timeframe !== "Referenz" && h.timeframe !== "Gegenwart",
  );
  const relevant = (future.length > 0 ? future : risk.hazards).filter(
    (h) => h.level === "hoch" || h.level === "sehr hoch",
  );

  const findings: DnshFinding[] = relevant.map((h) => ({
    gruppe: h.gruppe,
    label: h.label,
    level: h.level,
    timeframe: h.timeframe,
    anzeigewert: h.anzeigewert,
    adaptationMeasure:
      ADAPTATION_BY_GROUP[h.gruppe] ??
      "Gefährdungsspezifische Anpassungsmaßnahme erforderlich (Fachplanung)",
  }));

  if (findings.length === 0) {
    return {
      status: "konform",
      detail: `Klimarisiko-Screening (${risk.hazards.length} Gefährdungen) zeigt keine hohen Zukunfts-Gefährdungen – DNSH-Kriterium näherungsweise erfüllt.`,
      findings,
      assessedHazardCount: risk.hazards.length,
    };
  }

  const groups = [...new Set(findings.map((f) => f.gruppe))];
  return {
    status: "massnahmen_erforderlich",
    detail: `${findings.length} hohe Zukunfts-Gefährdung(en) (${groups.join(", ")}) – Anpassungsmaßnahmen sind für DNSH-Konformität umzusetzen/nachzuweisen.`,
    findings,
    assessedHazardCount: risk.hazards.length,
  };
}
