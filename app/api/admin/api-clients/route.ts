import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { apiClients } from "@/lib/db/schema";
import { requireAdmin, getOwnerScope } from "@/lib/auth";
import {
  generateClientCredentials,
  hashSecret,
} from "@/lib/api-auth";

export const runtime = "nodejs";

/** GET: API-Clients (nur Admin; Secrets werden nie zurueckgegeben). */
export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId)
    return NextResponse.json({ error: "Nur für Admins." }, { status: 403 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );

  const rows = await getDb()
    .select({
      id: apiClients.id,
      name: apiClients.name,
      clientId: apiClients.clientId,
      roles: apiClients.roles,
      active: apiClients.active,
      createdAt: apiClients.createdAt,
    })
    .from(apiClients)
    .orderBy(desc(apiClients.createdAt));

  return NextResponse.json({ apiClients: rows });
}

/**
 * POST: API-Client anlegen (nur Admin). Body: { name, roles? }
 * Das Client-Secret wird GENAU EINMAL in der Antwort ausgegeben.
 */
export async function POST(req: Request) {
  const adminId = await requireAdmin();
  if (!adminId)
    return NextResponse.json({ error: "Nur für Admins." }, { status: 403 });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Keine Datenbank konfiguriert." },
      { status: 503 },
    );
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  let body: { name?: unknown; roles?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name)
    return NextResponse.json({ error: "Name fehlt." }, { status: 400 });
  const roles = (
    Array.isArray(body.roles) ? body.roles : ["read"]
  ).filter((r): r is "read" | "write" => r === "read" || r === "write");
  if (roles.length === 0) roles.push("read");

  const credentials = generateClientCredentials();
  await getDb().insert(apiClients).values({
    userId: scope.userId,
    orgId: scope.orgId,
    name: name.slice(0, 200),
    clientId: credentials.clientId,
    clientSecretHash: hashSecret(credentials.clientSecret),
    roles,
  });

  return NextResponse.json(
    {
      clientId: credentials.clientId,
      // Nur einmalig sichtbar - wird ausschliesslich als Hash gespeichert
      clientSecret: credentials.clientSecret,
      roles,
    },
    { status: 201 },
  );
}
