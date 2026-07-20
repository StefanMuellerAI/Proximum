import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings, reportSnapshots } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";
import { recordEvent } from "@/lib/db/events";
import { recordAudit } from "@/lib/db/audit";
import { analyzeBase, analyzeScenario } from "@/lib/engine";
import { resolveAssumptionSet } from "@/lib/registry";
import { stableStringify } from "@/lib/data/assumptions";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST: eingefrorenen Report-Snapshot erzeugen (2.13-6, Abnahme 4.9).
 * Body: { assumptionSetId? }
 *
 * Der Snapshot enthaelt Eingangsdaten (normalized + Massnahmen), das
 * aufgeloeste Assumption-Set und die Analyse-Ergebnisse; der Hash ueber
 * die Eingangsdaten macht nachtraegliche Abweichungen nachweisbar.
 */
export async function POST(req: Request, { params }: Params) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );
  const { id } = await params;

  let assumptionSetId: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.assumptionSetId === "string")
      assumptionSetId = body.assumptionSetId;
  } catch {
    // Body optional
  }

  const [row] = await getDb()
    .select()
    .from(buildings)
    .where(and(eq(buildings.id, id), scopeFilter(scope)))
    .limit(1);
  if (!row)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const assumptions = await resolveAssumptionSet(assumptionSetId);
  const base = analyzeBase(row.normalized);
  const scen =
    (row.selectedMeasures ?? []).length > 0
      ? analyzeScenario(row.normalized, row.selectedMeasures)
      : null;

  const input = {
    normalized: row.normalized,
    selectedMeasures: row.selectedMeasures ?? [],
    assumptions,
  };
  const inputHash = createHash("sha256")
    .update(stableStringify(input))
    .digest("hex");

  const payload = {
    input,
    results: { base, scenario: scen },
    generatedAt: new Date().toISOString(),
  };

  const [snapshot] = await getDb()
    .insert(reportSnapshots)
    .values({
      buildingId: id,
      userId: scope.userId,
      orgId: scope.orgId,
      assumptionSetId,
      inputHash,
      payload,
    })
    .returning({ id: reportSnapshots.id, inputHash: reportSnapshots.inputHash });

  await recordAudit(scope, "report_snapshot", snapshot.id, "create", {
    after: { buildingId: id, inputHash },
  });
  await recordEvent("report_generated", scope, {
    buildingId: id,
    payload: { snapshotId: snapshot.id },
  });

  return NextResponse.json({ snapshot }, { status: 201 });
}

/** GET: Snapshots eines Gebaeudes (neueste zuerst, ohne Payload). */
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

  const [row] = await getDb()
    .select({ id: buildings.id })
    .from(buildings)
    .where(and(eq(buildings.id, id), scopeFilter(scope)))
    .limit(1);
  if (!row)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const snapshots = await getDb()
    .select({
      id: reportSnapshots.id,
      inputHash: reportSnapshots.inputHash,
      assumptionSetId: reportSnapshots.assumptionSetId,
      createdAt: reportSnapshots.createdAt,
    })
    .from(reportSnapshots)
    .where(eq(reportSnapshots.buildingId, id))
    .orderBy(desc(reportSnapshots.createdAt));

  return NextResponse.json({ snapshots });
}
