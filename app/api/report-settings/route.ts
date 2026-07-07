import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { reportSettings } from "@/lib/db/schema";
import {
  DEFAULT_REPORT_CONFIG,
  mergeReportConfig,
  reportConfigSchema,
} from "@/lib/report-config";

export const runtime = "nodejs";

interface ScopeInfo {
  scope: string;
  isOrg: boolean;
  /** true = darf die Config dieses Scopes aendern. */
  canEdit: boolean;
}

async function resolveScope(): Promise<ScopeInfo | null> {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) return null;
  if (orgId) {
    return {
      scope: `org:${orgId}`,
      isOrg: true,
      canEdit: orgRole === "org:admin",
    };
  }
  return { scope: `user:${userId}`, isOrg: false, canEdit: true };
}

/** GET: Report-Konfiguration des aktiven Scopes (Defaults, wenn leer). */
export async function GET() {
  const info = await resolveScope();
  if (!info)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!hasDatabase())
    return NextResponse.json({
      config: DEFAULT_REPORT_CONFIG,
      isOrg: false,
      canEdit: true,
    });

  const [row] = await getDb()
    .select()
    .from(reportSettings)
    .where(eq(reportSettings.scope, info.scope))
    .limit(1);

  return NextResponse.json({
    config: mergeReportConfig(row?.config),
    isOrg: info.isOrg,
    canEdit: info.canEdit,
  });
}

/** PUT: Report-Konfiguration speichern (Org: nur Org-Admins). */
export async function PUT(req: Request) {
  const info = await resolveScope();
  if (!info)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  if (!info.canEdit)
    return NextResponse.json(
      { error: "Nur Organisations-Admins können die Report-Konfiguration ändern." },
      { status: 403 },
    );
  if (!hasDatabase())
    return NextResponse.json({ error: "Keine Datenbank konfiguriert." }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = reportConfigSchema.safeParse(
    mergeReportConfig((body as { config?: unknown })?.config),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Konfiguration ungültig." }, { status: 400 });

  await getDb()
    .insert(reportSettings)
    .values({ scope: info.scope, config: parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: reportSettings.scope,
      set: { config: parsed.data, updatedAt: new Date() },
    });

  return NextResponse.json({ config: parsed.data });
}
