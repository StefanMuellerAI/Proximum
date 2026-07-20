import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
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

/**
 * Generischer Scope-Filter fuer beliebige Tabellen mit userId/orgId-Spalten
 * (economic_units, portfolios, ...). Gleiche Semantik wie scopeFilter.
 */
export function scopeFilterFor(
  scope: OwnerScope,
  cols: { userId: PgColumn; orgId: PgColumn },
): SQL {
  return scope.orgId
    ? (eq(cols.orgId, scope.orgId) as SQL)
    : (and(eq(cols.userId, scope.userId), isNull(cols.orgId)) as SQL);
}
