import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildingDrafts } from "@/lib/db/schema";
import { scopeFilterFor } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";
import {
  energieausweisSchema,
  normalizedBuildingSchema,
} from "@/lib/schema";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** GET: offene Entwuerfe im Scope (Wizard-Sitzung wiederaufnehmen). */
export async function GET() {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );

  const rows = await getDb()
    .select()
    .from(buildingDrafts)
    .where(scopeFilterFor(scope, buildingDrafts))
    .orderBy(desc(buildingDrafts.createdAt));

  return NextResponse.json({ drafts: rows });
}

/** POST: Entwurf nach Extraktion anlegen. Body: { extraction, normalized, name? } */
export async function POST(req: Request) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );

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
    .insert(buildingDrafts)
    .values({
      userId: scope.userId,
      orgId: scope.orgId,
      name:
        typeof body.name === "string"
          ? body.name
          : (normalized.data.adresse ?? null),
      extraction: extraction.data,
      normalized: normalized.data,
    })
    .returning({ id: buildingDrafts.id });

  return NextResponse.json({ draft: row }, { status: 201 });
}
