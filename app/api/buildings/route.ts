import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";
import {
  energieausweisSchema,
  normalizedBuildingSchema,
} from "@/lib/schema";

export const runtime = "nodejs";

/** Maximale Body-Groesse (Schutz gegen JSONB-Aufblaehung). */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * GET: alle Gebaeude im aktuellen Scope (Organisation oder persoenlich),
 * neueste zuerst. Bewusst schlanke Spaltenauswahl: die JSONB-Cache-Spalten
 * (facadeResult/riskResult) enthalten Base64-Bilder und gehoeren nicht in
 * die Liste.
 */
export async function GET() {
  const scope = await getOwnerScope();
  if (!scope) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "Keine Datenbank konfiguriert." }, { status: 503 });

  const rows = await getDb()
    .select({
      id: buildings.id,
      name: buildings.name,
      address: buildings.address,
      normalized: buildings.normalized,
      selectedMeasures: buildings.selectedMeasures,
      createdAt: buildings.createdAt,
    })
    .from(buildings)
    .where(scopeFilter(scope))
    .orderBy(desc(buildings.createdAt));

  return NextResponse.json({ buildings: rows });
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

  return NextResponse.json({ building: row }, { status: 201 });
}
