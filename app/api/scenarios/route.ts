import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { scenarios, measurePlans } from "@/lib/db/schema";
import { scopeFilterFor } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";

export const runtime = "nodejs";

/** GET: Szenarien im Scope (GAP-11). */
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
    .select({
      id: scenarios.id,
      name: scenarios.name,
      description: scenarios.description,
      portfolioId: scenarios.portfolioId,
      createdAt: scenarios.createdAt,
      planCount: sql<number>`count(${measurePlans.id})::int`,
    })
    .from(scenarios)
    .leftJoin(measurePlans, eq(measurePlans.scenarioId, scenarios.id))
    .where(scopeFilterFor(scope, scenarios))
    .groupBy(scenarios.id)
    .orderBy(desc(scenarios.createdAt));

  return NextResponse.json({ scenarios: rows });
}

/** POST: Szenario anlegen. Body: { name, description?, portfolioId? } */
export async function POST(req: Request) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );

  let body: { name?: unknown; description?: unknown; portfolioId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200)
    return NextResponse.json({ error: "Name fehlt/zu lang." }, { status: 400 });

  const [row] = await getDb()
    .insert(scenarios)
    .values({
      userId: scope.userId,
      orgId: scope.orgId,
      name,
      description:
        typeof body.description === "string"
          ? body.description.slice(0, 2000)
          : null,
      portfolioId:
        typeof body.portfolioId === "string" ? body.portfolioId : null,
    })
    .returning({ id: scenarios.id, name: scenarios.name });

  return NextResponse.json({ scenario: row }, { status: 201 });
}
