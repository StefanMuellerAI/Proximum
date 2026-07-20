import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { authorizeRequest } from "@/lib/api-auth";
import { recordEvent } from "@/lib/db/events";
import { analyzeBase, analyzeScenario } from "@/lib/engine";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * GET: Gebaeude inkl. vollstaendiger Analyse (oeffentliche API, READ).
 * Liefert normalized + AnalysisResult (CO2, CRREM inkl. Energiepfad,
 * Effizienzklasse, CO2KostAufG-Split, Taxonomie).
 */
export async function GET(req: Request, { params }: Params) {
  const auth = authorizeRequest(req, "read");
  if (!auth)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { id } = await params;
  const scope = { userId: auth.userId, orgId: auth.orgId };

  const [row] = await getDb()
    .select({
      id: buildings.id,
      name: buildings.name,
      address: buildings.address,
      normalized: buildings.normalized,
      selectedMeasures: buildings.selectedMeasures,
      createdAt: buildings.createdAt,
    })
    .from(buildings)
    .where(and(eq(buildings.id, id), scopeFilter(scope)))
    .limit(1);
  if (!row)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const base = analyzeBase(row.normalized);
  const scenario =
    (row.selectedMeasures ?? []).length > 0
      ? analyzeScenario(row.normalized, row.selectedMeasures)
      : null;

  await recordEvent("api_call", scope, {
    payload: { endpoint: "GET /public/v1/buildings/:id", clientId: auth.clientId },
  });

  return NextResponse.json({
    building: {
      id: row.id,
      name: row.name,
      address: row.address,
      normalized: row.normalized,
      selectedMeasures: row.selectedMeasures,
      createdAt: row.createdAt,
    },
    analysis: { base, scenario },
  });
}
