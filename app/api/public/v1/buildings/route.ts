import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { authorizeRequest } from "@/lib/api-auth";
import { recordEvent } from "@/lib/db/events";
import {
  energieausweisSchema,
  normalizedBuildingSchema,
} from "@/lib/schema";

export const runtime = "nodejs";

/**
 * GET: Gebaeudeliste (oeffentliche API, READ-Rolle, GAP-14).
 * Auth: Bearer-Token aus POST /api/public/oauth/token.
 */
export async function GET(req: Request) {
  const auth = authorizeRequest(req, "read");
  if (!auth)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const scope = { userId: auth.userId, orgId: auth.orgId };
  const limit = Math.min(
    500,
    Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 100),
  );

  const rows = await getDb()
    .select({
      id: buildings.id,
      name: buildings.name,
      address: buildings.address,
      createdAt: buildings.createdAt,
      crremType: sql<string>`${buildings.normalized}->>'crremType'`,
      epcClass: sql<string | null>`${buildings.normalized}->>'epcClass'`,
      areaM2: sql<number | null>`(${buildings.normalized}->>'bezugsflaecheM2')::numeric`,
      totalKwhM2a: sql<number | null>`(${buildings.normalized}->>'totalKwhM2a')::numeric`,
    })
    .from(buildings)
    .where(scopeFilter(scope))
    .orderBy(desc(buildings.createdAt))
    .limit(limit);

  await recordEvent("api_call", scope, {
    payload: { endpoint: "GET /public/v1/buildings", clientId: auth.clientId },
  });

  return NextResponse.json({ buildings: rows });
}

/** POST: Gebaeude anlegen (WRITE-Rolle). Body: { extraction, normalized, name? } */
export async function POST(req: Request) {
  const auth = authorizeRequest(req, "write");
  if (!auth)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  let body: { extraction?: unknown; normalized?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const extraction = energieausweisSchema.safeParse(body.extraction);
  const normalized = normalizedBuildingSchema.safeParse(body.normalized);
  if (!extraction.success || !normalized.success)
    return NextResponse.json(
      { error: "invalid_payload", detail: "extraction/normalized ungültig." },
      { status: 400 },
    );

  const scope = { userId: auth.userId, orgId: auth.orgId };
  const [row] = await getDb()
    .insert(buildings)
    .values({
      userId: scope.userId,
      orgId: scope.orgId,
      name:
        typeof body.name === "string" ? body.name : (normalized.data.adresse ?? null),
      address: normalized.data.adresse ?? null,
      extraction: extraction.data,
      normalized: normalized.data,
      selectedMeasures: [],
    })
    .returning({ id: buildings.id });

  await recordEvent("api_call", scope, {
    payload: { endpoint: "POST /public/v1/buildings", clientId: auth.clientId },
  });

  return NextResponse.json({ building: row }, { status: 201 });
}
