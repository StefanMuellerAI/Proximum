import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { assumptionSets } from "@/lib/db/schema";
import { scopeFilterFor } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";
import { defaultAssumptionSet } from "@/lib/data/assumptions";

export const runtime = "nodejs";

/** GET: Annahme-Pakete im Scope (inkl. berechnetem Default). */
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
    .from(assumptionSets)
    .where(scopeFilterFor(scope, assumptionSets))
    .orderBy(desc(assumptionSets.createdAt));

  return NextResponse.json({
    default: defaultAssumptionSet(),
    assumptionSets: rows,
  });
}

/**
 * POST: Annahme-Paket einfrieren. Body: { name?, payload? }
 * Ohne payload wird der aktuelle Default eingefroren (Report-Snapshot).
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

  let body: { name?: unknown; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const payload =
    body.payload && typeof body.payload === "object"
      ? (body.payload as Record<string, unknown>)
      : (defaultAssumptionSet() as unknown as Record<string, unknown>);
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 200)
      : `Eingefroren ${new Date().toISOString().slice(0, 10)}`;

  const [row] = await getDb()
    .insert(assumptionSets)
    .values({
      userId: scope.userId,
      orgId: scope.orgId,
      name,
      payload,
      frozen: true,
    })
    .returning({ id: assumptionSets.id, name: assumptionSets.name });

  return NextResponse.json({ assumptionSet: row }, { status: 201 });
}
