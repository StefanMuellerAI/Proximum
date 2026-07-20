import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings, taxonomyChecks } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { getOwnerScope } from "@/lib/auth";
import { recordEvent } from "@/lib/db/events";
import { analyzeBase } from "@/lib/engine";
import {
  TAXONOMY_QUESTIONNAIRE,
  evaluateTaxonomyCheck,
  type TaxonomyAnswer,
} from "@/lib/taxonomy-check";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET: Fragebogen (mit Auto-Vorbelegung aus dem Screening) + Historie. */
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
    .select({ id: buildings.id, normalized: buildings.normalized })
    .from(buildings)
    .where(and(eq(buildings.id, id), scopeFilter(scope)))
    .limit(1);
  if (!row)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  // Auto-Fragen aus dem aktuellen Screening vorbelegen
  const base = analyzeBase(row.normalized);
  const prefill: Record<string, TaxonomyAnswer> = {
    sc_ped: base.taxonomy.aligned ? "ja" : "nein",
  };

  const history = await getDb()
    .select({
      id: taxonomyChecks.id,
      completed: taxonomyChecks.completed,
      result: taxonomyChecks.result,
      createdAt: taxonomyChecks.createdAt,
    })
    .from(taxonomyChecks)
    .where(eq(taxonomyChecks.buildingId, id))
    .orderBy(desc(taxonomyChecks.createdAt));

  return NextResponse.json({
    questionnaire: TAXONOMY_QUESTIONNAIRE,
    prefill,
    history,
  });
}

/**
 * POST: Check abschliessen. Body: { answers }
 * Der abgeschlossene Check ist eine unveraenderliche Momentaufnahme:
 * Antworten + Bewertung + Screening-Stand werden eingefroren.
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

  const [row] = await getDb()
    .select({ id: buildings.id, normalized: buildings.normalized })
    .from(buildings)
    .where(and(eq(buildings.id, id), scopeFilter(scope)))
    .limit(1);
  if (!row)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  let body: { answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  const answers = (body.answers ?? {}) as Record<string, TaxonomyAnswer>;
  const validValues = new Set(["ja", "nein", "nicht_anwendbar", null]);
  for (const v of Object.values(answers))
    if (!validValues.has(v))
      return NextResponse.json({ error: "Ungültige Antwort." }, { status: 400 });

  const evaluation = evaluateTaxonomyCheck(answers);
  const base = analyzeBase(row.normalized);

  const [check] = await getDb()
    .insert(taxonomyChecks)
    .values({
      buildingId: id,
      userId: scope.userId,
      orgId: scope.orgId,
      answers,
      result: {
        evaluation,
        screening: {
          taxonomy: base.taxonomy,
          co2IntensityKgM2a: base.co2.intensityKgM2a,
          frozenAt: new Date().toISOString(),
        },
      },
      completed: evaluation.open.length === 0,
    })
    .returning({ id: taxonomyChecks.id, completed: taxonomyChecks.completed });

  await recordEvent("report_generated", scope, {
    buildingId: id,
    payload: { kind: "taxonomy_check", checkId: check.id },
  });

  return NextResponse.json({ check, evaluation }, { status: 201 });
}
