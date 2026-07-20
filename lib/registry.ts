/**
 * Regelwerk-Registry-Loader (Spez. 2.13-5, Server).
 *
 * Regelwerke (Effizienzklassen, PEF, EF, CO2-Preise, Foerderquoten) sind
 * Daten mit Gueltigkeitszeitraeumen. Die eingebauten Referenzdaten
 * (lib/data/*) sind der Default; Zeilen in regulation_versions
 * UEBERSCHREIBEN sie per Datenpflege - ein Regelwechsel (z. B. das
 * ausstehende NWG-Stufenmodell oder die EPBD-Klassenskala ~2030) ist damit
 * ein Datenimport, kein Deployment.
 *
 * Jeder Energieausweis wird nach dem Recht seines Ausstellungsdatums
 * interpretiert: atDate = Ausstellungsdatum des Ausweises.
 */
import { and, eq, isNull, lte, or, gte, desc } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { regulationVersions } from "@/lib/db/schema";
import {
  assumptionSets as assumptionSetsTable,
} from "@/lib/db/schema";
import {
  defaultAssumptionSet,
  type AssumptionSet,
} from "@/lib/data/assumptions";

export type RegulationKind =
  | "effizienzklassen"
  | "pef"
  | "emissionsfaktoren"
  | "co2preise"
  | "foerderquoten"
  | "co2kostaufg";

/**
 * Aktives Regelwerk-Payload fuer kind/country zum Stichtag; null = kein
 * Override vorhanden (eingebaute Defaults gelten).
 */
export async function loadRegulationPayload(
  kind: RegulationKind,
  country = "DE",
  atDate: Date = new Date(),
): Promise<Record<string, unknown> | null> {
  if (!hasDatabase()) return null;
  try {
    const rows = await getDb()
      .select()
      .from(regulationVersions)
      .where(
        and(
          eq(regulationVersions.kind, kind),
          eq(regulationVersions.country, country),
          eq(regulationVersions.active, true),
          or(
            isNull(regulationVersions.validFrom),
            lte(regulationVersions.validFrom, atDate),
          ),
          or(
            isNull(regulationVersions.validTo),
            gte(regulationVersions.validTo, atDate),
          ),
        ),
      )
      .orderBy(desc(regulationVersions.createdAt))
      .limit(1);
    return rows[0]?.payload ?? null;
  } catch {
    return null;
  }
}

/**
 * Aufgeloestes Assumption-Set: DB-Zeile (eingefroren oder nicht) oder
 * Default-Set aus den aktuellen Referenzdaten.
 */
export async function resolveAssumptionSet(
  id: string | null,
): Promise<AssumptionSet> {
  if (!id || !hasDatabase()) return defaultAssumptionSet();
  try {
    const rows = await getDb()
      .select()
      .from(assumptionSetsTable)
      .where(eq(assumptionSetsTable.id, id))
      .limit(1);
    if (rows.length === 0) return defaultAssumptionSet();
    return rows[0].payload as unknown as AssumptionSet;
  } catch {
    return defaultAssumptionSet();
  }
}
