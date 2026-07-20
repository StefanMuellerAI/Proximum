/**
 * Job-Queue (2.13-12d): DB-basierte Warteschlange, eventgetrieben ueber den
 * Recompute-DAAG - Aenderungen am Gebaeudezustand enqueuen eine
 * KPI-Materialisierung; ein Cron-/Manual-Trigger (POST /api/jobs/run)
 * arbeitet die Queue in kleinen Batches ab (Vercel-tauglich).
 */
import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import {
  buildings,
  buildingKpisYearly,
  jobs,
} from "@/lib/db/schema";
import { analyzeBase } from "@/lib/engine";

const MAX_ATTEMPTS = 3;

/** Job einreihen (best effort; Fehler brechen den Request nicht). */
export async function enqueueJob(
  type: "materialize_kpis" | "recompute_portfolio",
  payload: Record<string, unknown>,
): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await getDb().insert(jobs).values({ type, payload });
  } catch (err) {
    console.error("Job konnte nicht eingereiht werden:", err);
  }
}

/** KPI-Materialisierung fuer ein Gebaeude (idempotent: replace). */
async function materializeKpis(buildingId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: buildings.id, normalized: buildings.normalized })
    .from(buildings)
    .where(eq(buildings.id, buildingId))
    .limit(1);
  if (!row) return; // Gebaeude geloescht -> Job obsolet

  const base = analyzeBase(row.normalized);
  const values = base.crrem.series.map((p, i) => ({
    buildingId,
    year: p.year,
    co2IntensityKgM2a: p.gebaeude,
    pathwayKgM2a: p.pfad,
    euiKwhM2a: base.crrem.energy.series[i]?.gebaeude ?? 0,
    energyPathwayKwhM2a: base.crrem.energy.series[i]?.pfad ?? 0,
    stranded: p.gebaeude > p.pfad,
  }));

  await db
    .delete(buildingKpisYearly)
    .where(eq(buildingKpisYearly.buildingId, buildingId));
  // Batches (Neon-Parameterlimit)
  for (let i = 0; i < values.length; i += 50)
    await db.insert(buildingKpisYearly).values(values.slice(i, i + 50));
}

export interface JobRunResult {
  processed: number;
  failed: number;
}

/** Arbeitet bis zu `limit` offene Jobs ab (aelteste zuerst). */
export async function runPendingJobs(limit = 10): Promise<JobRunResult> {
  if (!hasDatabase()) return { processed: 0, failed: 0 };
  const db = getDb();

  const pending = await db
    .select()
    .from(jobs)
    .where(
      and(
        or(eq(jobs.status, "pending"), eq(jobs.status, "error")),
        lt(jobs.attempts, MAX_ATTEMPTS),
      ),
    )
    .orderBy(asc(jobs.createdAt))
    .limit(limit);

  let processed = 0;
  let failed = 0;
  for (const job of pending) {
    await db
      .update(jobs)
      .set({
        status: "running",
        attempts: sql`${jobs.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id));
    try {
      if (job.type === "materialize_kpis") {
        const buildingId = job.payload.buildingId;
        if (typeof buildingId === "string") await materializeKpis(buildingId);
      }
      // recompute_portfolio: Aggregation laeuft on-demand (A3); der Job-Typ
      // ist fuer kuenftige Cache-Invalidierung reserviert.
      await db
        .update(jobs)
        .set({ status: "done", updatedAt: new Date() })
        .where(eq(jobs.id, job.id));
      processed++;
    } catch (err) {
      await db
        .update(jobs)
        .set({
          status: "error",
          lastError: err instanceof Error ? err.message : String(err),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      failed++;
    }
  }
  return { processed, failed };
}
