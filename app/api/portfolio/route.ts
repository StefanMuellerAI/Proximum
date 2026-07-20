import { NextResponse } from "next/server";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings, portfolioMembers } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";
import { aggregatePortfolio } from "@/lib/engine/portfolio";

export const runtime = "nodejs";

/**
 * GET: serverseitige Portfolio-Aggregation (2.13-12b).
 *
 * Laedt alle Gebaeude des Scopes serverseitig (kein 4,5-MB-Response-Limit,
 * da nur das Aggregat + schlanke Entries zurueckgehen) und fuehrt die pure
 * aggregatePortfolio-Engine aus. Die Antwort waechst nur mit ~200 Bytes je
 * Gebaeude (Entry-Zeile) statt mit dem vollen normalized-JSONB.
 *
 * Optional ?portfolioId=<uuid>: nur Gebaeude dieses Portfolios (direkte
 * Mitglieder + Gebaeude der Mitglieds-Wirtschaftseinheiten, A7).
 */
export async function GET(req: Request) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );

  const db = getDb();
  const portfolioId = new URL(req.url).searchParams.get("portfolioId");

  let where = scopeFilter(scope);
  if (portfolioId) {
    const members = await db
      .select({
        buildingId: portfolioMembers.buildingId,
        economicUnitId: portfolioMembers.economicUnitId,
      })
      .from(portfolioMembers)
      .where(eq(portfolioMembers.portfolioId, portfolioId));
    const buildingIds = members
      .map((m) => m.buildingId)
      .filter((v): v is string => v != null);
    const unitIds = members
      .map((m) => m.economicUnitId)
      .filter((v): v is string => v != null);
    const conds = [];
    if (buildingIds.length > 0) conds.push(inArray(buildings.id, buildingIds));
    if (unitIds.length > 0)
      conds.push(inArray(buildings.economicUnitId, unitIds));
    if (conds.length === 0) {
      return NextResponse.json({ portfolio: aggregatePortfolio([]) });
    }
    where = and(where, or(...conds))!;
  }

  const rows = await db
    .select({
      id: buildings.id,
      name: buildings.name,
      address: buildings.address,
      normalized: buildings.normalized,
      selectedMeasures: buildings.selectedMeasures,
      createdAt: buildings.createdAt,
    })
    .from(buildings)
    .where(where)
    .orderBy(desc(buildings.createdAt));

  const aggregation = aggregatePortfolio(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      normalized: r.normalized,
      selectedMeasures: r.selectedMeasures ?? [],
      createdAt: r.createdAt,
    })),
  );

  return NextResponse.json({ portfolio: aggregation });
}
