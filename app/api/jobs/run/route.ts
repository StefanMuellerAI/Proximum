import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runPendingJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST: Job-Queue abarbeiten (2.13-12d). Trigger: Vercel-Cron (Header
 * x-cron-secret == JOBS_CRON_SECRET) oder eingeloggter Admin.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.JOBS_CRON_SECRET;
  const viaCron =
    cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  const viaAdmin = !viaCron && Boolean(await requireAdmin());
  if (!viaCron && !viaAdmin)
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 403 });

  const limit = Math.min(
    50,
    Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 10),
  );
  const result = await runPendingJobs(limit);
  return NextResponse.json(result);
}
