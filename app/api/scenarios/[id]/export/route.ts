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
import { getOwnerScope } from "@/lib/auth";
import {
  evaluateScenario,
  type PlannedMeasure,
  type ScenarioBuildingInput,
} from "@/lib/engine/scenario";
import { writeXlsx, type ExportSheet } from "@/lib/export/xlsx";
import { RENOVATION_MEASURES } from "@/lib/data/reference";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET: Szenario-Excel-Export (GAP-11): Zeitverlauf + Gebaeude + Massnahmen. */
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

  const db = getDb();
  const [scenario] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, id), scopeFilterFor(scope, scenarios)))
    .limit(1);
  if (!scenario)
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const plans = await db
    .select()
    .from(measurePlans)
    .where(eq(measurePlans.scenarioId, id));
  const planIds = plans.map((p) => p.id);
  const allMeasures =
    planIds.length > 0
      ? await db.select().from(measures).where(inArray(measures.planId, planIds))
      : [];
  const buildingRows =
    plans.length > 0
      ? await db
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
          )
      : [];

  const inputs: ScenarioBuildingInput[] = plans
    .map((plan) => {
      const b = buildingRows.find((x) => x.id === plan.buildingId);
      if (!b) return null;
      const planned: PlannedMeasure[] = allMeasures
        .filter((m) => m.planId === plan.id)
        .map((m) => ({
          measureId: m.measureId,
          implementationDate: m.implementationDate?.toISOString() ?? null,
          costOverrideEur: m.costIsManual ? m.costOverrideEur : null,
        }));
      return { id: b.id, name: b.name, normalized: b.normalized, measures: planned };
    })
    .filter((x): x is ScenarioBuildingInput => x !== null);

  const evaluation = evaluateScenario(inputs);

  const measureLabel = (mid: string) =>
    mid === "exklusion"
      ? "Exklusion (Verkauf/Rückbau)"
      : (RENOVATION_MEASURES.find((m) => m.id === mid)?.label ?? mid);

  const sheets: ExportSheet[] = [
    {
      name: "Zeitverlauf",
      rows: [
        [
          "Jahr",
          "CO2-Intensität (kg/m²a)",
          "CRREM-Pfad (kg/m²a)",
          "Investition (EUR)",
          "Investition kumuliert (EUR)",
          "Gestrandete Gebäude",
          "Aktive Fläche (m²)",
        ],
        ...evaluation.timeline.map((p) => [
          p.year,
          Number(p.co2IntensityKgM2a.toFixed(2)),
          Number(p.pathwayKgM2a.toFixed(2)),
          Math.round(p.investEur),
          Math.round(p.cumulativeInvestEur),
          p.strandedCount,
          Math.round(p.activeAreaM2),
        ]),
      ],
    },
    {
      name: "Gebäude",
      rows: [
        ["Gebäude", "Stranding-Jahr", "Exklusion ab", "Maßnahmenzahl"],
        ...evaluation.buildings.map((b) => {
          const input = inputs.find((i) => i.id === b.buildingId);
          return [
            b.name ?? b.buildingId,
            b.strandingYear ?? "kein Stranding",
            b.excludedFromYear ?? "",
            input?.measures.length ?? 0,
          ];
        }),
      ],
    },
    {
      name: "Maßnahmen",
      rows: [
        ["Gebäude", "Maßnahme", "Umsetzungsdatum", "Kosten (Override, EUR)"],
        ...inputs.flatMap((i) =>
          i.measures.map((m) => [
            i.name ?? i.id,
            measureLabel(m.measureId),
            m.implementationDate?.slice(0, 10) ?? "",
            m.costOverrideEur ?? "",
          ]),
        ),
      ],
    },
  ];

  const xlsx = writeXlsx(sheets);
  const filename = `Szenario_${scenario.name.replace(/[^\w]+/g, "-")}.xlsx`;
  return new NextResponse(Buffer.from(xlsx), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
