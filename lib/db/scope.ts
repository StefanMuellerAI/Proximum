import { and, eq, isNull, type SQL } from "drizzle-orm";
import { buildings } from "@/lib/db/schema";
import type { OwnerScope } from "@/lib/auth";

/**
 * Drizzle-Filter fuer den Eigentums-Scope:
 * - aktive Organisation -> alle Gebaeude der Organisation (Mandant)
 * - sonst -> persoenliche Gebaeude des Users (orgId IS NULL)
 */
export function scopeFilter(scope: OwnerScope): SQL {
  return scope.orgId
    ? eq(buildings.orgId, scope.orgId)
    : (and(eq(buildings.userId, scope.userId), isNull(buildings.orgId)) as SQL);
}
