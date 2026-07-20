/**
 * Audit-Schicht (2.13-6): Append-only-Log-Helper. Fehler beim Schreiben
 * brechen den fachlichen Request nie (best effort mit Fehler-Log) -
 * pruefungssicheres Reporting entsteht aus Log + Report-Snapshots.
 */
import { getDb, hasDatabase } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import type { OwnerScope } from "@/lib/auth";

export async function recordAudit(
  scope: OwnerScope,
  entity: string,
  entityId: string,
  action: "create" | "update" | "delete",
  opts?: {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await getDb().insert(auditLog).values({
      userId: scope.userId,
      orgId: scope.orgId,
      entity,
      entityId,
      action,
      before: opts?.before ?? null,
      after: opts?.after ?? null,
    });
  } catch (err) {
    console.error("Audit-Log konnte nicht geschrieben werden:", err);
  }
}
