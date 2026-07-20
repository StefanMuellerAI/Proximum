import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import {
  buildings,
  measurePlans,
  measures,
  scenarios,
} from "@/lib/db/schema";
import { scopeFilter, scopeFilterFor } from "@/lib/db/scope";
import { getOwnerScope, type OwnerScope } from "@/lib/auth";
import {
  evaluateScenario,
  isValidPlanMeasureId,
  type PlannedMeasure,
  type ScenarioBuildingInput,
} from "@/lib/engine/scenario";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function loadScenario(id: string, scope: OwnerScope) {
  const [row] = await getDb()
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, id), scopeFilterFor(scope, scenarios)))
    .limit(1);
  return row ?? null;
}

async function loadInputs(scenarioId: string, scope: OwnerScope): Promise<ScenarioBuildingInput[]> {
  const db = getDb();
  const plans = await db
    .select()
    .from(measurePlans)
    .where(eq(measurePlans.scenarioId, scenarioId));
  if (plans.length === 0) return [];

  const planIds = plans.map((p) => p.id);
  const allMeasures = await db
    .select()
    .from(measures)
    .where(inArray(measures.planId, planIds));
  const buildingRows = await db
    .select({
      id: buildings.id,
      name: buildings.name,
      normalized: buildings.normalized,
    })
    .from(buildings)
    .where(
      and(
        scopeFilter(scope),
        inArray(
          buildings.id,
          plans.map((p) => p.buildingId),
        ),
      ),
    );

  return plans
    .map((plan) => {
      const building = buildingRows.find((b) => b.id === plan.buildingId);
      if (!building) return null;
      const planned: PlannedMeasure[] = allMeasures
        .filter((m) => m.planId === plan.id)
        .map((m) => ({
          measureId: m.measureId,
          implementationDate: m.implementationDate
            ? m.implementationDate.toISOString()
            : null,
          costOverrideEur: m.costIsManual ? m.costOverrideEur : null,
        }));
      return {
        id: building.id,
        name: building.name,
        normalized: building.normalized,
        measures: planned,
      };
    })
    .filter((x): x is ScenarioBuildingInput => x !== null);
}

/** GET: Szenario inkl. Bewertung (Zeitverlauf, Stranding, Investitionen). */
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
  const scenario = await loadScenario(id, scope);
  if (!scenario)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const inputs = await loadInputs(id, scope);
  const evaluation = evaluateScenario(inputs);

  return NextResponse.json({
    scenario: {
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      portfolioId: scenario.portfolioId,
    },
    evaluation,
  });
}

/**
 * PATCH: Plaene/Massnahmen setzen (GAP-11).
 * Body:
 *  - name?: string
 *  - setPlans?: { buildingId, measures: { measureId, implementationDate?,
 *      costOverrideEur? }[] }[]  (ersetzt den Plan des Gebaeudes)
 *  - bulkMeasure?: { buildingIds, measureId, implementationDate? }
 *      (Sammelmassnahme: fuegt die Massnahme allen Gebaeuden hinzu)
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
  const scenario = await loadScenario(id, scope);
  if (!scenario)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  let body: {
    name?: unknown;
    setPlans?: unknown;
    bulkMeasure?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const db = getDb();

  if (typeof body.name === "string" && body.name.trim())
    await db
      .update(scenarios)
      .set({ name: body.name.trim().slice(0, 200), updatedAt: new Date() })
      .where(eq(scenarios.id, id));

  // Plan je Gebaeude ersetzen
  if (Array.isArray(body.setPlans)) {
    for (const raw of body.setPlans) {
      const plan = raw as {
        buildingId?: unknown;
        measures?: unknown;
      };
      if (typeof plan.buildingId !== "string" || !Array.isArray(plan.measures))
        continue;
      // Gebaeude muss im Scope liegen
      const [b] = await db
        .select({ id: buildings.id })
        .from(buildings)
        .where(and(scopeFilter(scope), eq(buildings.id, plan.buildingId)))
        .limit(1);
      if (!b) continue;

      // Bestehenden Plan ersetzen
      await db
        .delete(measurePlans)
        .where(
          and(
            eq(measurePlans.scenarioId, id),
            eq(measurePlans.buildingId, plan.buildingId),
          ),
        );
      const [newPlan] = await db
        .insert(measurePlans)
        .values({ scenarioId: id, buildingId: plan.buildingId })
        .returning({ id: measurePlans.id });

      const valid = plan.measures
        .map((m) => m as { measureId?: unknown; implementationDate?: unknown; costOverrideEur?: unknown })
        .filter(
          (m): m is { measureId: string; implementationDate?: string; costOverrideEur?: number } =>
            typeof m.measureId === "string" && isValidPlanMeasureId(m.measureId),
        );
      if (valid.length > 0)
        await db.insert(measures).values(
          valid.map((m) => ({
            planId: newPlan.id,
            measureId: m.measureId,
            implementationDate: m.implementationDate
              ? new Date(m.implementationDate)
              : null,
            costOverrideEur:
              typeof m.costOverrideEur === "number" ? m.costOverrideEur : null,
            costIsManual: typeof m.costOverrideEur === "number",
          })),
        );
    }
  }

  // Sammelmassnahme (GAP-11): eine Massnahme auf viele Gebaeude
  if (body.bulkMeasure && typeof body.bulkMeasure === "object") {
    const bulk = body.bulkMeasure as {
      buildingIds?: unknown;
      measureId?: unknown;
      implementationDate?: unknown;
    };
    const buildingIds = Array.isArray(bulk.buildingIds)
      ? bulk.buildingIds.filter((v): v is string => typeof v === "string")
      : [];
    if (
      typeof bulk.measureId === "string" &&
      isValidPlanMeasureId(bulk.measureId) &&
      buildingIds.length > 0
    ) {
      const scoped = await db
        .select({ id: buildings.id })
        .from(buildings)
        .where(and(scopeFilter(scope), inArray(buildings.id, buildingIds)));
      for (const b of scoped) {
        let [plan] = await db
          .select({ id: measurePlans.id })
          .from(measurePlans)
          .where(
            and(
              eq(measurePlans.scenarioId, id),
              eq(measurePlans.buildingId, b.id),
            ),
          )
          .limit(1);
        if (!plan) {
          [plan] = await db
            .insert(measurePlans)
            .values({ scenarioId: id, buildingId: b.id })
            .returning({ id: measurePlans.id });
        }
        await db.insert(measures).values({
          planId: plan.id,
          measureId: bulk.measureId,
          implementationDate:
            typeof bulk.implementationDate === "string"
              ? new Date(bulk.implementationDate)
              : null,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

/** DELETE: Szenario loeschen (Plaene/Massnahmen kaskadieren). */
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
    .delete(scenarios)
    .where(and(eq(scenarios.id, id), scopeFilterFor(scope, scenarios)))
    .returning({ id: scenarios.id });
  if (rows.length === 0)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
