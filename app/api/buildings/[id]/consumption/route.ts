import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings, consumptionRecords } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { getOwnerScope, type OwnerScope } from "@/lib/auth";
import {
  aggregateConsumption,
  dedupeHash,
  demandVsConsumption,
} from "@/lib/engine/consumption";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const recordSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  reportingYear: z.number().int().min(2000).max(2100),
  carrier: z.string().max(100),
  amountKwh: z.number().min(-10_000_000).max(10_000_000),
  costEur: z.number().min(-10_000_000).max(10_000_000).nullable().optional(),
  source: z.enum(["rechnung", "manuell", "schaetzung"]).optional(),
  reviewStatus: z.enum(["bestaetigt", "pruefung", "verworfen"]).optional(),
});

async function scopedBuilding(id: string, scope: OwnerScope) {
  const [row] = await getDb()
    .select({
      id: buildings.id,
      normalized: buildings.normalized,
    })
    .from(buildings)
    .where(and(eq(buildings.id, id), scopeFilter(scope)))
    .limit(1);
  return row ?? null;
}

/**
 * GET: Verbrauchsdatensaetze + Aggregation je Berichtsjahr (Gap-Analyse,
 * Hochrechnung) + Bedarf-vs.-Verbrauch-Abgleich (GAP-7 + 1.4a).
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
  const building = await scopedBuilding(id, scope);
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

  return NextResponse.json({ records, aggregations, comparison });
}

/**
 * POST: Verbrauchsdatensatz anlegen (manuell oder aus Rechnungs-Import).
 * Duplikat-Erkennung ueber dedupeHash: Treffer -> reviewStatus "pruefung".
 */
export async function POST(req: Request, { params }: Params) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );
  const { id } = await params;
  const building = await scopedBuilding(id, scope);
  if (!building)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  const parsed = recordSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Datensatz ungültig." }, { status: 400 });

  const data = parsed.data;
  const hash = dedupeHash(data);

  // Duplikat-/Storno-Erkennung: gleicher Hash -> Review-Queue (2.13-13)
  const [existing] = await getDb()
    .select({ id: consumptionRecords.id })
    .from(consumptionRecords)
    .where(
      and(
        eq(consumptionRecords.buildingId, id),
        eq(consumptionRecords.dedupeHash, hash),
      ),
    )
    .limit(1);
  const isNegative = data.amountKwh < 0; // Storno/Gutschrift
  const reviewStatus =
    data.reviewStatus ?? (existing || isNegative ? "pruefung" : "bestaetigt");

  const [row] = await getDb()
    .insert(consumptionRecords)
    .values({
      buildingId: id,
      periodStart: new Date(data.periodStart),
      periodEnd: new Date(data.periodEnd),
      reportingYear: data.reportingYear,
      carrier: data.carrier,
      amountKwh: data.amountKwh,
      costEur: data.costEur ?? null,
      source: data.source ?? "manuell",
      reviewStatus,
      dedupeHash: hash,
    })
    .returning({ id: consumptionRecords.id, reviewStatus: consumptionRecords.reviewStatus });

  return NextResponse.json(
    { record: row, duplicateSuspected: Boolean(existing) },
    { status: 201 },
  );
}

/** PATCH: Review-Entscheidung. Body: { recordId, reviewStatus } */
export async function PATCH(req: Request, { params }: Params) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );
  const { id } = await params;
  const building = await scopedBuilding(id, scope);
  if (!building)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  let body: { recordId?: unknown; reviewStatus?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  if (
    typeof body.recordId !== "string" ||
    !["bestaetigt", "pruefung", "verworfen"].includes(String(body.reviewStatus))
  )
    return NextResponse.json({ error: "recordId/reviewStatus fehlt." }, { status: 400 });

  const rows = await getDb()
    .update(consumptionRecords)
    .set({
      reviewStatus: body.reviewStatus as "bestaetigt" | "pruefung" | "verworfen",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(consumptionRecords.id, body.recordId),
        eq(consumptionRecords.buildingId, id),
      ),
    )
    .returning({ id: consumptionRecords.id });
  if (rows.length === 0)
    return NextResponse.json({ error: "Datensatz nicht gefunden." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
