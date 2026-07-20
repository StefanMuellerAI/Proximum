import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { portfolios, portfolioMembers } from "@/lib/db/schema";
import { scopeFilterFor } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";

export const runtime = "nodejs";

/** GET: alle Portfolios im Scope inkl. Mitgliederzahl. */
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
      id: portfolios.id,
      name: portfolios.name,
      createdAt: portfolios.createdAt,
      memberCount: sql<number>`count(${portfolioMembers.id})::int`,
    })
    .from(portfolios)
    .leftJoin(portfolioMembers, eq(portfolioMembers.portfolioId, portfolios.id))
    .where(scopeFilterFor(scope, portfolios))
    .groupBy(portfolios.id)
    .orderBy(desc(portfolios.createdAt));

  return NextResponse.json({ portfolios: rows });
}

/** POST: Portfolio anlegen. Body: { name } */
export async function POST(req: Request) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200)
    return NextResponse.json(
      { error: "Name fehlt oder ist zu lang (max. 200 Zeichen)." },
      { status: 400 },
    );

  const [row] = await getDb()
    .insert(portfolios)
    .values({ userId: scope.userId, orgId: scope.orgId, name })
    .returning({ id: portfolios.id, name: portfolios.name });

  return NextResponse.json({ portfolio: row }, { status: 201 });
}
