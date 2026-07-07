import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings, type BuildingRow } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { getOwnerScope, type OwnerScope } from "@/lib/auth";
import { normalizedBuildingSchema } from "@/lib/schema";
import { RENOVATION_MEASURES } from "@/lib/data/reference";

export const runtime = "nodejs";

/** Maximale Body-Groesse (Schutz gegen JSONB-Aufblaehung). */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MEASURE_IDS = new Set(RENOVATION_MEASURES.map((m) => m.id));

async function loadScoped(
  id: string,
  scope: OwnerScope,
): Promise<BuildingRow | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await getDb()
    .select()
    .from(buildings)
    .where(and(eq(buildings.id, id), scopeFilter(scope)))
    .limit(1);
  return row ?? null;
}

/** GET: einzelnes Gebaeude (nur im eigenen Scope). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getOwnerScope();
  if (!scope) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "Keine Datenbank konfiguriert." }, { status: 503 });

  const { id } = await params;
  const row = await loadScoped(id, scope);
  if (!row) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  return NextResponse.json({ building: row });
}

/**
 * PATCH: Overrides/Auswahl speichern.
 * Body: { normalized?, selectedMeasures?, name? } – alle Felder validiert.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getOwnerScope();
  if (!scope) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "Keine Datenbank konfiguriert." }, { status: 503 });

  const { id } = await params;
  const row = await loadScoped(id, scope);
  if (!row) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES)
    return NextResponse.json({ error: "Request zu groß." }, { status: 413 });

  let body: { normalized?: unknown; selectedMeasures?: unknown; name?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const patch: Partial<typeof buildings.$inferInsert> = { updatedAt: new Date() };

  if (body.normalized !== undefined) {
    const parsed = normalizedBuildingSchema.safeParse(body.normalized);
    if (!parsed.success)
      return NextResponse.json(
        { error: "normalized ungültig." },
        { status: 400 },
      );
    patch.normalized = parsed.data;
    patch.address = parsed.data.adresse ?? row.address;
  }

  if (body.selectedMeasures !== undefined) {
    if (
      !Array.isArray(body.selectedMeasures) ||
      !body.selectedMeasures.every(
        (m): m is string => typeof m === "string" && MEASURE_IDS.has(m),
      )
    )
      return NextResponse.json(
        { error: "selectedMeasures enthält unbekannte Maßnahmen." },
        { status: 400 },
      );
    patch.selectedMeasures = body.selectedMeasures;
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.length > 300)
      return NextResponse.json({ error: "name ungültig." }, { status: 400 });
    patch.name = body.name;
  }

  const [updated] = await getDb()
    .update(buildings)
    .set(patch)
    .where(and(eq(buildings.id, id), scopeFilter(scope)))
    .returning();

  return NextResponse.json({ building: updated });
}

/** DELETE: Gebaeude loeschen (nur im eigenen Scope). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getOwnerScope();
  if (!scope) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "Keine Datenbank konfiguriert." }, { status: 503 });

  const { id } = await params;
  const row = await loadScoped(id, scope);
  if (!row) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  await getDb()
    .delete(buildings)
    .where(and(eq(buildings.id, id), scopeFilter(scope)));

  return NextResponse.json({ ok: true });
}
