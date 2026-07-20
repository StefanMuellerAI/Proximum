import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings, consumptionRecords } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";
import {
  aggregateConsumption,
  demandVsConsumption,
} from "@/lib/engine/consumption";
import { writeXlsx } from "@/lib/export/xlsx";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * GET: Verbrauchs-Excel (GAP-13) mit Gap-Analyse- und Abweichungs-Blaettern
 * (Bedarf vs. Verbrauch).
 */
export async function GET(_req: Request, { params }: Params) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );
  const { id } = await params;

  const [building] = await getDb()
    .select({
      id: buildings.id,
      name: buildings.name,
      normalized: buildings.normalized,
    })
    .from(buildings)
    .where(and(eq(buildings.id, id), scopeFilter(scope)))
    .limit(1);
  if (!building)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const records = await getDb()
    .select()
    .from(consumptionRecords)
    .where(eq(consumptionRecords.buildingId, id))
    .orderBy(asc(consumptionRecords.periodStart));

  const aggregations = aggregateConsumption(records);
  const comparison = demandVsConsumption(
    aggregations,
    building.normalized.totalKwhM2a,
    building.normalized.bezugsflaecheM2,
  );

  const xlsx = writeXlsx([
    {
      name: "Verbräuche",
      rows: [
        ["Zeitraum von", "Zeitraum bis", "Berichtsjahr", "Energieträger", "Menge (kWh)", "Kosten (EUR)", "Quelle", "Status"],
        ...records.map((r) => [
          r.periodStart.toISOString().slice(0, 10),
          r.periodEnd.toISOString().slice(0, 10),
          r.reportingYear,
          r.carrier,
          r.amountKwh,
          r.costEur ?? "",
          r.source,
          r.reviewStatus,
        ]),
      ],
    },
    {
      name: "Gap-Analyse",
      rows: [
        ["Berichtsjahr", "Verbrauch (kWh)", "Abgedeckte Monate", "Lücke", "Hochrechnung 12 Monate (kWh)"],
        ...aggregations.map((a) => [
          a.reportingYear,
          Math.round(a.totalKwh),
          Number(a.coveredMonths.toFixed(1)),
          a.hasGap ? "JA" : "nein",
          Math.round(a.extrapolatedTotalKwh),
        ]),
      ],
    },
    {
      name: "Abweichung Bedarf-Verbrauch",
      rows: [
        ["Berichtsjahr", "Verbrauch (kWh/m²a)", "Bedarf (kWh/m²a)", "Verhältnis", "Einordnung"],
        ...comparison.map((c) => [
          c.reportingYear,
          Number(c.consumptionKwhM2a.toFixed(1)),
          Number(c.demandKwhM2a.toFixed(1)),
          Number(c.ratio.toFixed(2)),
          c.assessment === "verbrauch_deutlich_unter_bedarf"
            ? "Verbrauch deutlich unter Bedarf (Prebound)"
            : c.assessment === "verbrauch_ueber_bedarf"
              ? "Verbrauch über Bedarf"
              : "konsistent",
        ]),
      ],
    },
  ]);

  const filename = `Verbrauch_${(building.name ?? id).replace(/[^\w]+/g, "-")}.xlsx`;
  return new NextResponse(Buffer.from(xlsx), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
