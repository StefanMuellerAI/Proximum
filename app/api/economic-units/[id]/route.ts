import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { economicUnits } from "@/lib/db/schema";
import { scopeFilterFor } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** PATCH: Wirtschaftseinheit umbenennen. Body: { name } */
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

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200)
    return NextResponse.json({ error: "Name fehlt/zu lang." }, { status: 400 });

  const rows = await getDb()
    .update(economicUnits)
    .set({ name })
    .where(and(eq(economicUnits.id, id), scopeFilterFor(scope, economicUnits)))
    .returning({ id: economicUnits.id });
  if (rows.length === 0)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE: Wirtschaftseinheit loeschen (Gebaeude bleiben, FK wird NULL). */
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
    .delete(economicUnits)
    .where(and(eq(economicUnits.id, id), scopeFilterFor(scope, economicUnits)))
    .returning({ id: economicUnits.id });
  if (rows.length === 0)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
