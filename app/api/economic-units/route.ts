import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings, economicUnits } from "@/lib/db/schema";
import { scopeFilterFor } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";

export const runtime = "nodejs";

/** GET: alle Wirtschaftseinheiten im Scope inkl. Gebaeudeanzahl. */
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
      id: economicUnits.id,
      name: economicUnits.name,
      createdAt: economicUnits.createdAt,
      buildingCount: sql<number>`count(${buildings.id})::int`,
    })
    .from(economicUnits)
    .leftJoin(buildings, eq(buildings.economicUnitId, economicUnits.id))
    .where(scopeFilterFor(scope, economicUnits))
    .groupBy(economicUnits.id)
    .orderBy(desc(economicUnits.createdAt));

  return NextResponse.json({ economicUnits: rows });
}

/** POST: Wirtschaftseinheit anlegen. Body: { name, buildingIds? } */
export async function POST(req: Request) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );

  let body: { name?: unknown; buildingIds?: unknown };
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

  const db = getDb();
  const [unit] = await db
    .insert(economicUnits)
    .values({ userId: scope.userId, orgId: scope.orgId, name })
    .returning({ id: economicUnits.id, name: economicUnits.name });

  // Optional: Gebaeude direkt zuordnen (nur eigene im Scope)
  const buildingIds = Array.isArray(body.buildingIds)
    ? body.buildingIds.filter((v): v is string => typeof v === "string")
    : [];
  if (buildingIds.length > 0) {
    const { scopeFilter } = await import("@/lib/db/scope");
    const { and, inArray } = await import("drizzle-orm");
    await db
      .update(buildings)
      .set({ economicUnitId: unit.id })
      .where(and(scopeFilter(scope), inArray(buildings.id, buildingIds)));
  }

  return NextResponse.json({ economicUnit: unit }, { status: 201 });
}
