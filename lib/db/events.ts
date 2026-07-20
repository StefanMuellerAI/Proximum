/**
 * Metering-Events (2.13-13): leichter Helper zum Aufzeichnen von
 * Produkt-Ereignissen. Fehler beim Event-Schreiben duerfen den fachlichen
 * Request nie brechen (best effort, fire-and-forget mit Fehler-Log).
 */
import { getDb, hasDatabase } from "@/lib/db";
import { events, type MeteringEventType } from "@/lib/db/schema";
import type { OwnerScope } from "@/lib/auth";

export async function recordEvent(
  type: MeteringEventType,
  scope: OwnerScope,
  opts?: { buildingId?: string; payload?: Record<string, unknown> },
): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await getDb().insert(events).values({
      type,
      userId: scope.userId,
      orgId: scope.orgId,
      buildingId: opts?.buildingId ?? null,
      payload: opts?.payload ?? null,
    });
  } catch (err) {
    console.error("Metering-Event konnte nicht geschrieben werden:", err);
  }
}
