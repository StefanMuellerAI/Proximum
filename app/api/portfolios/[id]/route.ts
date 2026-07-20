import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import {
  buildings,
  economicUnits,
  portfolioMembers,
  portfolios,
} from "@/lib/db/schema";
import { scopeFilter, scopeFilterFor } from "@/lib/db/scope";
import { getOwnerScope, type OwnerScope } from "@/lib/auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function loadScopedPortfolio(id: string, scope: OwnerScope) {
  const [row] = await getDb()
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(and(eq(portfolios.id, id), scopeFilterFor(scope, portfolios)))
    .limit(1);
  return row ?? null;
}

/** GET: Portfolio mit Mitglieder-IDs. */
export async function GET(_req: Request, { params }: Params) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );
  const { id } = await params;
  const portfolio = await loadScopedPortfolio(id, scope);
  if (!portfolio)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const members = await getDb()
    .select({
      buildingId: portfolioMembers.buildingId,
      economicUnitId: portfolioMembers.economicUnitId,
    })
    .from(portfolioMembers)
    .where(eq(portfolioMembers.portfolioId, id));

  return NextResponse.json({ portfolio: { id, members } });
}

/**
 * PATCH: umbenennen und/oder Mitglieder aendern.
 * Body: { name?, addBuildingIds?, removeBuildingIds?, addEconomicUnitIds?,
 *         removeEconomicUnitIds? }
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
  const portfolio = await loadScopedPortfolio(id, scope);
  if (!portfolio)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  let body: {
    name?: unknown;
    addBuildingIds?: unknown;
    removeBuildingIds?: unknown;
    addEconomicUnitIds?: unknown;
    removeEconomicUnitIds?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const ids = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const db = getDb();

  if (typeof body.name === "string" && body.name.trim()) {
    await db
      .update(portfolios)
      .set({ name: body.name.trim().slice(0, 200) })
      .where(eq(portfolios.id, id));
  }

  // Nur Gebaeude/WEs des eigenen Scopes zulassen
  const addB = ids(body.addBuildingIds);
  if (addB.length > 0) {
    const valid = await db
      .select({ id: buildings.id })
      .from(buildings)
      .where(and(scopeFilter(scope), inArray(buildings.id, addB)));
    const existing = await db
      .select({ buildingId: portfolioMembers.buildingId })
      .from(portfolioMembers)
      .where(
        and(
          eq(portfolioMembers.portfolioId, id),
          inArray(
            portfolioMembers.buildingId,
            valid.map((v) => v.id),
          ),
        ),
      );
    const existingSet = new Set(existing.map((e) => e.buildingId));
    const toInsert = valid.filter((v) => !existingSet.has(v.id));
    if (toInsert.length > 0)
      await db.insert(portfolioMembers).values(
        toInsert.map((v) => ({ portfolioId: id, buildingId: v.id })),
      );
  }

  const removeB = ids(body.removeBuildingIds);
  if (removeB.length > 0)
    await db
      .delete(portfolioMembers)
      .where(
        and(
          eq(portfolioMembers.portfolioId, id),
          inArray(portfolioMembers.buildingId, removeB),
        ),
      );

  const addE = ids(body.addEconomicUnitIds);
  if (addE.length > 0) {
    const valid = await db
      .select({ id: economicUnits.id })
      .from(economicUnits)
      .where(
        and(scopeFilterFor(scope, economicUnits), inArray(economicUnits.id, addE)),
      );
    const existing = await db
      .select({ economicUnitId: portfolioMembers.economicUnitId })
      .from(portfolioMembers)
      .where(
        and(
          eq(portfolioMembers.portfolioId, id),
          inArray(
            portfolioMembers.economicUnitId,
            valid.map((v) => v.id),
          ),
        ),
      );
    const existingSet = new Set(existing.map((e) => e.economicUnitId));
    const toInsert = valid.filter((v) => !existingSet.has(v.id));
    if (toInsert.length > 0)
      await db.insert(portfolioMembers).values(
        toInsert.map((v) => ({ portfolioId: id, economicUnitId: v.id })),
      );
  }

  const removeE = ids(body.removeEconomicUnitIds);
  if (removeE.length > 0)
    await db
      .delete(portfolioMembers)
      .where(
        and(
          eq(portfolioMembers.portfolioId, id),
          inArray(portfolioMembers.economicUnitId, removeE),
        ),
      );

  return NextResponse.json({ ok: true });
}

/** DELETE: Portfolio loeschen (Mitgliedschaften kaskadieren). */
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
    .delete(portfolios)
    .where(and(eq(portfolios.id, id), scopeFilterFor(scope, portfolios)))
    .returning({ id: portfolios.id });
  if (rows.length === 0)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
