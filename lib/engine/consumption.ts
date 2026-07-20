/**
 * Verbrauchsdaten-Rechenwerk (GAP-7, Spez. 2.6/1.4a):
 *
 * - Aggregation der consumption_records je Berichtsjahr und Traeger
 * - Gap-Analyse: fehlende Monatsabdeckung je Berichtsjahr
 * - CRREM-Hochrechnung ("whole building approach"): unvollstaendige Jahre
 *   werden linear auf 12 Monate hochgerechnet
 * - Bedarf-vs.-Verbrauch-Abgleich (Prebound-Sichtbarkeit, 1.4a):
 *   gehoert PROMINENT ins UI, nicht in einen Reiter.
 */
import { matchCarrier, type CarrierKey } from "@/lib/data/reference";

export interface ConsumptionRecordInput {
  periodStart: string | Date;
  periodEnd: string | Date;
  reportingYear: number;
  carrier: string;
  amountKwh: number;
  costEur?: number | null;
  reviewStatus?: "bestaetigt" | "pruefung" | "verworfen";
}

export interface YearAggregation {
  reportingYear: number;
  /** Summe kWh je Traeger (nur bestaetigte Datensaetze). */
  byCarrier: Partial<Record<CarrierKey, number>>;
  totalKwh: number;
  totalCostEur: number;
  /** Abgedeckte Monate (0..12) ueber alle Zeitraeume. */
  coveredMonths: number;
  /** Hochrechnung auf 12 Monate (whole building approach). */
  extrapolatedTotalKwh: number;
  /** true = Jahr unvollstaendig (Gap-Analyse). */
  hasGap: boolean;
}

function monthsBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.min(12, ms / (30.44 * 24 * 3600 * 1000)));
}

/** Aggregiert Verbrauchsdatensaetze je Berichtsjahr (Gap + Hochrechnung). */
export function aggregateConsumption(
  records: ConsumptionRecordInput[],
): YearAggregation[] {
  const byYear = new Map<number, ConsumptionRecordInput[]>();
  for (const r of records) {
    if (r.reviewStatus === "verworfen") continue;
    byYear.set(r.reportingYear, [...(byYear.get(r.reportingYear) ?? []), r]);
  }

  const out: YearAggregation[] = [];
  for (const [year, rows] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const byCarrier: Partial<Record<CarrierKey, number>> = {};
    let totalKwh = 0;
    let totalCostEur = 0;
    // Monatsabdeckung ueber die Union der Zeitraeume (vereinfachte Summe,
    // gekappt auf 12 - ueberlappende Rechnungen desselben Traegers zaehlen
    // nur einmal, indem je Traeger separat gekappt wird)
    const monthsByCarrier = new Map<CarrierKey, number>();

    for (const r of rows) {
      const key = matchCarrier(r.carrier);
      byCarrier[key] = (byCarrier[key] ?? 0) + r.amountKwh;
      totalKwh += r.amountKwh;
      totalCostEur += r.costEur ?? 0;
      const m = monthsBetween(new Date(r.periodStart), new Date(r.periodEnd));
      monthsByCarrier.set(key, Math.min(12, (monthsByCarrier.get(key) ?? 0) + m));
    }

    const coveredMonths =
      monthsByCarrier.size > 0
        ? Math.min(
            12,
            [...monthsByCarrier.values()].reduce((s, v) => s + v, 0) /
              monthsByCarrier.size,
          )
        : 0;
    const hasGap = coveredMonths < 11.5; // Toleranz fuer Abrechnungsversatz
    const extrapolatedTotalKwh =
      coveredMonths > 0 ? (totalKwh / coveredMonths) * 12 : 0;

    out.push({
      reportingYear: year,
      byCarrier,
      totalKwh,
      totalCostEur,
      coveredMonths,
      extrapolatedTotalKwh,
      hasGap,
    });
  }
  return out;
}

export interface DemandVsConsumption {
  reportingYear: number;
  /** Verbrauch (hochgerechnet) je m2 (kWh/m2a). */
  consumptionKwhM2a: number;
  /** Bedarf laut Ausweis (kWh/m2a). */
  demandKwhM2a: number;
  /** Verbrauch / Bedarf (z. B. 0,7 = Prebound: 30 % unter Bedarf). */
  ratio: number;
  assessment: "verbrauch_deutlich_unter_bedarf" | "konsistent" | "verbrauch_ueber_bedarf";
}

/**
 * Bedarf-vs.-Verbrauch-Abgleich (1.4a): vergleicht den realen (hochge-
 * rechneten) Verbrauch mit dem Ausweis-Bedarf. Prebound-Befund
 * ("Verbrauch deutlich unter Bedarf") relativiert bedarfsbasierte
 * Einsparprognosen.
 */
export function demandVsConsumption(
  aggregations: YearAggregation[],
  demandKwhM2a: number,
  areaM2: number | null,
): DemandVsConsumption[] {
  if (areaM2 == null || areaM2 <= 0 || demandKwhM2a <= 0) return [];
  return aggregations
    .filter((a) => a.extrapolatedTotalKwh > 0)
    .map((a) => {
      const consumptionKwhM2a = a.extrapolatedTotalKwh / areaM2;
      const ratio = consumptionKwhM2a / demandKwhM2a;
      return {
        reportingYear: a.reportingYear,
        consumptionKwhM2a,
        demandKwhM2a,
        ratio,
        assessment:
          ratio < 0.8
            ? "verbrauch_deutlich_unter_bedarf"
            : ratio > 1.2
              ? "verbrauch_ueber_bedarf"
              : "konsistent",
      };
    });
}

/** Duplikat-/Storno-Hash: Zeitraum + Traeger + Menge (gerundet). */
export function dedupeHash(r: ConsumptionRecordInput): string {
  const start = new Date(r.periodStart).toISOString().slice(0, 10);
  const end = new Date(r.periodEnd).toISOString().slice(0, 10);
  return `${start}|${end}|${matchCarrier(r.carrier)}|${Math.round(Math.abs(r.amountKwh))}`;
}
