import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildingDrafts } from "@/lib/db/schema";
import { scopeFilterFor } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";
import { normalizedBuildingSchema } from "@/lib/schema";
import type { FootprintResult } from "@/lib/footprint";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH: Entwurf aktualisieren (Review-Korrekturen, Karten-Selektion, Name).
 * Body: { normalized?, footprint?, name? }
 */
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

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES)
    return NextResponse.json({ error: "Request zu groß." }, { status: 413 });

  let body: { normalized?: unknown; footprint?: unknown; name?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const patch: Partial<{
    normalized: ReturnType<typeof normalizedBuildingSchema.parse>;
    footprint: FootprintResult;
    name: string;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (body.normalized !== undefined) {
    const parsed = normalizedBuildingSchema.safeParse(body.normalized);
    if (!parsed.success)
      return NextResponse.json({ error: "normalized ungültig." }, { status: 400 });
    patch.normalized = parsed.data;
  }
  if (body.footprint !== undefined) {
    // Footprint stammt aus der eigenen API; hier nur Grob-Validierung
    const fp = body.footprint as FootprintResult;
    if (!fp || !Array.isArray(fp.buildings))
      return NextResponse.json({ error: "footprint ungültig." }, { status: 400 });
    patch.footprint = fp;
  }
  if (typeof body.name === "string") patch.name = body.name.slice(0, 300);

  const rows = await getDb()
    .update(buildingDrafts)
    .set(patch)
    .where(
      and(eq(buildingDrafts.id, id), scopeFilterFor(scope, buildingDrafts)),
    )
    .returning({ id: buildingDrafts.id });
  if (rows.length === 0)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE: Entwurf verwerfen. */
export async function DELETE(_req: Request, { params }: Params) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );
  const { id } = await params;

  const rows = await getDb()
    .delete(buildingDrafts)
    .where(
      and(eq(buildingDrafts.id, id), scopeFilterFor(scope, buildingDrafts)),
    )
    .returning({ id: buildingDrafts.id });
  if (rows.length === 0)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
