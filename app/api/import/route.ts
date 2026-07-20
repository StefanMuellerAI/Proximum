import { NextResponse } from "next/server";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings } from "@/lib/db/schema";
import { getOwnerScope } from "@/lib/auth";
import { recordEvent } from "@/lib/db/events";
import { enqueueJob } from "@/lib/jobs";
import { parsePrediumExcel } from "@/lib/import/predium-excel";

export const runtime = "nodejs";

/** Excel-Exporte koennen gross sein; Grenze grosszuegig, aber hart. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Insert-Batchgroesse (Neon/HTTP-Parameterlimits). */
const INSERT_BATCH = 50;

/**
 * POST: Bulk-Import eines Predium-Excel-Exports (Abloeseplan 1.1).
 * Body: multipart/form-data mit Feld "file" (.xlsx).
 * Antwort: { imported, skipped, errors, columnMap, sheetName }.
 */
export async function POST(req: Request) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Erwartet multipart/form-data mit Feld 'file'." },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "Datei fehlt (Feld 'file')." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES)
    return NextResponse.json({ error: "Datei zu groß (max. 25 MB)." }, { status: 413 });

  const data = new Uint8Array(await file.arrayBuffer());

  let result;
  try {
    result = parsePrediumExcel(data);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Excel-Datei konnte nicht gelesen werden: ${e instanceof Error ? e.message : "unbekannter Fehler"}`,
      },
      { status: 422 },
    );
  }

  if (result.buildings.length === 0)
    return NextResponse.json(
      {
        error: "Keine importierbaren Gebäude gefunden.",
        errors: result.errors,
        columnMap: result.columnMap,
        sheetName: result.sheetName,
      },
      { status: 422 },
    );

  const db = getDb();
  const ids: string[] = [];
  for (let i = 0; i < result.buildings.length; i += INSERT_BATCH) {
    const batch = result.buildings.slice(i, i + INSERT_BATCH);
    const rows = await db
      .insert(buildings)
      .values(
        batch.map((b) => ({
          userId: scope.userId,
          orgId: scope.orgId,
          name: b.name,
          address: b.normalized.adresse ?? null,
          extraction: b.extraction,
          normalized: b.normalized,
          selectedMeasures: [] as string[],
        })),
      )
      .returning({ id: buildings.id });
    ids.push(...rows.map((r) => r.id));
  }

  await recordEvent("buildings_imported", scope, {
    payload: { count: ids.length, skipped: result.errors.length, sheet: result.sheetName },
  });
  for (const buildingId of ids)
    await enqueueJob("materialize_kpis", { buildingId });

  return NextResponse.json(
    {
      imported: ids.length,
      ids,
      skipped: result.errors.length,
      errors: result.errors,
      columnMap: result.columnMap,
      sheetName: result.sheetName,
    },
    { status: 201 },
  );
}
