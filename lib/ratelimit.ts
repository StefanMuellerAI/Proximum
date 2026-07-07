/**
 * Rate-Limiting fuer teure API-Routen (Upstash Redis, Sliding Window je User).
 *
 * Fail-open: ohne KV_REST_API_URL/-TOKEN (z. B. lokale Entwicklung ohne
 * `vercel env pull`) wird nicht limitiert.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitBucket = "extract" | "facade" | "risk" | "adminCreate";

/** Limits je Stunde und User (Sliding Window). */
const LIMITS: Record<RateLimitBucket, number> = {
  extract: 10, // Claude Sonnet (teuerste Route)
  facade: 30, // Google Street View + Claude Vision
  risk: 60, // Geocoding + Gefahren-API
  adminCreate: 20, // User anlegen/einladen
};

let redis: Redis | null | undefined;
const limiters = new Map<RateLimitBucket, Ratelimit>();

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

function getLimiter(bucket: RateLimitBucket): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  let limiter = limiters.get(bucket);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(LIMITS[bucket], "1 h"),
      prefix: `rl:${bucket}`,
    });
    limiters.set(bucket, limiter);
  }
  return limiter;
}

export interface RateLimitResult {
  ok: boolean;
  /** Sekunden bis zum naechsten freien Slot (nur bei ok=false). */
  retryAfterSeconds: number | null;
}

/**
 * Prueft das Limit fuer einen User. Fail-open bei fehlender Konfiguration
 * oder Redis-Fehlern (Verfuegbarkeit vor Strenge; Routen sind ohnehin
 * login-pflichtig und die Instanz invite-only).
 */
export async function checkRateLimit(
  bucket: RateLimitBucket,
  userId: string,
): Promise<RateLimitResult> {
  const limiter = getLimiter(bucket);
  if (!limiter) return { ok: true, retryAfterSeconds: null };
  try {
    const { success, reset } = await limiter.limit(userId);
    return {
      ok: success,
      retryAfterSeconds: success
        ? null
        : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch {
    return { ok: true, retryAfterSeconds: null };
  }
}

/** Einheitliche 429-Antwort. */
export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    {
      error:
        "Zu viele Anfragen – bitte später erneut versuchen (Kostenschutz für KI-/Karten-Abrufe).",
    },
    {
      status: 429,
      headers: result.retryAfterSeconds
        ? { "Retry-After": String(result.retryAfterSeconds) }
        : undefined,
    },
  );
}
