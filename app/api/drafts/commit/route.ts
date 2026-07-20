import { NextResponse } from "next/server";
import { and, inArray } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildingDrafts, buildings, economicUnits } from "@/lib/db/schema";
import { scopeFilterFor } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";
import { recordEvent } from "@/lib/db/events";

export const runtime = "nodejs";

/**
 * POST: Entwuerfe bestaetigen -> Gebaeude anlegen (A6, Schritt 4).
 * Body: { draftIds: string[], economicUnitName?: string }
 *
 * Erst dieser Schritt erzeugt buildings-Zeilen; optional werden alle
 * bestaetigten Gebaeude zu einer neuen Wirtschaftseinheit zusammengefasst.
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

  let body: { draftIds?: unknown; economicUnitName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  const draftIds = Array.isArray(body.draftIds)
    ? body.draftIds.filter((v): v is string => typeof v === "string")
    : [];
  if (draftIds.length === 0)
    return NextResponse.json({ error: "draftIds fehlt/leer." }, { status: 400 });

  const db = getDb();
  const drafts = await db
    .select()
    .from(buildingDrafts)
    .where(
      and(
        scopeFilterFor(scope, buildingDrafts),
        inArray(buildingDrafts.id, draftIds),
      ),
    );
  if (drafts.length === 0)
    return NextResponse.json({ error: "Keine Entwürfe gefunden." }, { status: 404 });

  // Optional: Wirtschaftseinheit anlegen (A7)
  let economicUnitId: string | null = null;
  const euName =
    typeof body.economicUnitName === "string"
      ? body.economicUnitName.trim()
      : "";
  if (euName) {
    const [unit] = await db
      .insert(economicUnits)
      .values({ userId: scope.userId, orgId: scope.orgId, name: euName.slice(0, 200) })
      .returning({ id: economicUnits.id });
    economicUnitId = unit.id;
  }

  const created = await db
    .insert(buildings)
    .values(
      drafts.map((d) => ({
        userId: scope.userId,
        orgId: scope.orgId,
        name: d.name ?? d.normalized.adresse ?? null,
        address: d.normalized.adresse ?? null,
        economicUnitId,
        extraction: d.extraction,
        normalized: d.normalized,
        selectedMeasures: [] as string[],
        footprint: d.footprint ?? null,
        cachedAt: d.footprint ? new Date() : null,
      })),
    )
    .returning({ id: buildings.id });

  await db
    .delete(buildingDrafts)
    .where(
      and(
        scopeFilterFor(scope, buildingDrafts),
        inArray(
          buildingDrafts.id,
          drafts.map((d) => d.id),
        ),
      ),
    );

  for (const row of created)
    await recordEvent("building_created", scope, { buildingId: row.id });

  return NextResponse.json(
    {
      buildings: created,
      economicUnitId,
    },
    { status: 201 },
  );
}
