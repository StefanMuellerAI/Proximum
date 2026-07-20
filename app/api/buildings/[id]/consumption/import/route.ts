import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings, consumptionRecords } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { recordEvent } from "@/lib/db/events";
import { extractEnergieRechnung } from "@/lib/extraction";
import { dedupeHash } from "@/lib/engine/consumption";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

/**
 * POST: Rechnungs-Import (GAP-7 + 2.13-13) - Energierechnung (PDF) durch
 * die Vision-Pipeline (PLUS-1), Positionen als Verbrauchsdatensaetze.
 *
 * Review-Queue: Konfidenz "mittel"/"gering", Duplikate (dedupeHash) und
 * Storno-Positionen landen mit reviewStatus "pruefung" zur Bestaetigung.
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
  const limit = await checkRateLimit("extract", scope.userId);
  if (!limit.ok) return rateLimitResponse(limit);
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ist nicht gesetzt." },
      { status: 500 },
    );

  const { id } = await params;
  const [building] = await getDb()
    .select({ id: buildings.id })
    .from(buildings)
    .where(and(eq(buildings.id, id), scopeFilter(scope)))
    .limit(1);
  if (!building)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json(
      { error: "multipart/form-data mit Feld 'file' erwartet." },
      { status: 400 },
    );
  }
  if (!file)
    return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "Datei zu groß (max. 20 MB)." }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = await extractEnergieRechnung(bytes, file.name);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Rechnung konnte nicht strukturiert gelesen werden." },
      { status: 422 },
    );

  const extraction = parsed.data;
  const lowConfidence =
    extraction.konfidenz === "mittel" || extraction.konfidenz === "gering";

  const created: { id: string; reviewStatus: string }[] = [];
  for (const pos of extraction.positionen) {
    const start = new Date(pos.zeitraum_von);
    const end = new Date(pos.zeitraum_bis);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const reportingYear = end.getFullYear();
    const input = {
      periodStart: start,
      periodEnd: end,
      reportingYear,
      carrier: pos.energietraeger,
      amountKwh: pos.menge_kwh,
    };
    const hash = dedupeHash(input);

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

    const needsReview =
      lowConfidence ||
      Boolean(existing) ||
      pos.menge_kwh < 0 ||
      extraction.ist_storno_oder_gutschrift === true;

    const [row] = await getDb()
      .insert(consumptionRecords)
      .values({
        buildingId: id,
        periodStart: start,
        periodEnd: end,
        reportingYear,
        carrier: pos.energietraeger,
        amountKwh: pos.menge_kwh,
        costEur: pos.kosten_eur ?? null,
        source: "rechnung",
        reviewStatus: needsReview ? "pruefung" : "bestaetigt",
        dedupeHash: hash,
      })
      .returning({
        id: consumptionRecords.id,
        reviewStatus: consumptionRecords.reviewStatus,
      });
    created.push(row);
  }

  await recordEvent("document_processed", scope, {
    buildingId: id,
    payload: { kind: "energierechnung", filename: file.name, positions: created.length },
  });

  return NextResponse.json(
    {
      imported: created.length,
      records: created,
      lieferant: extraction.lieferant ?? null,
      konfidenz: extraction.konfidenz ?? null,
      reviewRequired: created.filter((c) => c.reviewStatus === "pruefung").length,
    },
    { status: 201 },
  );
}
