import { NextResponse } from "next/server";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";
import { recordEvent } from "@/lib/db/events";
import { enqueueJob } from "@/lib/jobs";
import {
  energieausweisSchema,
  normalizedBuildingSchema,
} from "@/lib/schema";

export const runtime = "nodejs";

/** Maximale Body-Groesse (Schutz gegen JSONB-Aufblaehung). */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/** Keyset-Cursor: createdAt (ISO) + id, base64-kodiert. */
function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(
  cursor: string,
): { createdAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
    const createdAt = new Date(iso);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * GET: Gebaeude im aktuellen Scope (Organisation oder persoenlich) als
 * schlanke Listen-Projektion mit Keyset-Pagination (2.13-12a).
 *
 * Query-Parameter:
 * - limit:  Seitengroesse (Default 100, max 500)
 * - cursor: Fortsetzungs-Cursor aus der vorherigen Antwort (nextCursor)
 *
 * Bewusst OHNE normalized-JSONB: KPI-Felder werden per JSONB-Projektion
 * extrahiert; vollstaendige Daten liefert GET /api/buildings/[id], Portfolio-
 * Aggregate liefert GET /api/portfolio (serverseitig).
 */
export async function GET(req: Request) {
  const scope = await getOwnerScope();
  if (!scope) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "Keine Datenbank konfiguriert." }, { status: 503 });

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const cursorParam = url.searchParams.get("cursor");
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursorParam && !cursor)
    return NextResponse.json({ error: "Ungültiger Cursor." }, { status: 400 });

  const where = cursor
    ? and(
        scopeFilter(scope),
        or(
          lt(buildings.createdAt, cursor.createdAt),
          and(
            eq(buildings.createdAt, cursor.createdAt),
            lt(buildings.id, cursor.id),
          ),
        ),
      )
    : scopeFilter(scope);

  const rows = await getDb()
    .select({
      id: buildings.id,
      name: buildings.name,
      address: buildings.address,
      selectedMeasures: buildings.selectedMeasures,
      createdAt: buildings.createdAt,
      // Schlanke JSONB-Projektion statt vollem normalized-Objekt
      crremType: sql<string>`${buildings.normalized}->>'crremType'`,
      epcClass: sql<string | null>`${buildings.normalized}->>'epcClass'`,
      hauptnutzung: sql<string | null>`${buildings.normalized}->>'hauptnutzung'`,
      areaM2: sql<number | null>`(${buildings.normalized}->>'bezugsflaecheM2')::numeric`,
      totalKwhM2a: sql<number | null>`(${buildings.normalized}->>'totalKwhM2a')::numeric`,
    })
    .from(buildings)
    .where(where)
    .orderBy(desc(buildings.createdAt), desc(buildings.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(new Date(last.createdAt), last.id) : null;

  return NextResponse.json({ buildings: page, nextCursor });
}

/** POST: Gebaeude nach Extraktion anlegen. Body: { extraction, normalized } */
export async function POST(req: Request) {
  const scope = await getOwnerScope();
  if (!scope) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "Keine Datenbank konfiguriert." }, { status: 503 });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES)
    return NextResponse.json({ error: "Request zu groß." }, { status: 413 });

  let body: { extraction?: unknown; normalized?: unknown; name?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const extraction = energieausweisSchema.safeParse(body.extraction);
  const normalized = normalizedBuildingSchema.safeParse(body.normalized);
  if (!extraction.success || !normalized.success)
    return NextResponse.json(
      { error: "extraction/normalized ungültig oder unvollständig." },
      { status: 400 },
    );

  const [row] = await getDb()
    .insert(buildings)
    .values({
      userId: scope.userId,
      orgId: scope.orgId,
      name:
        typeof body.name === "string"
          ? body.name
          : (normalized.data.adresse ?? null),
      address: normalized.data.adresse ?? null,
      extraction: extraction.data,
      normalized: normalized.data,
      selectedMeasures: [],
    })
    .returning({ id: buildings.id });

  await recordEvent("building_created", scope, { buildingId: row.id });
  await enqueueJob("materialize_kpis", { buildingId: row.id });

  return NextResponse.json({ building: row }, { status: 201 });
}
