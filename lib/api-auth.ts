/**
 * OAuth 2.0 Client Credentials fuer die oeffentliche API (GAP-14).
 *
 * - Clients (api_clients) haben client_id + Secret (nur als SHA-256-Hash
 *   gespeichert) und Rollen READ/WRITE.
 * - Access-Tokens sind statuslose HMAC-Tokens (HS256-artig) mit Ablauf:
 *   base64url(payload).base64url(HMAC-SHA256(payload, API_TOKEN_SECRET)).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { apiClients } from "@/lib/db/schema";

export type ApiRole = "read" | "write";

export interface ApiTokenPayload {
  clientId: string;
  userId: string;
  orgId: string | null;
  roles: ApiRole[];
  /** Unix-Sekunden. */
  exp: number;
}

const TOKEN_TTL_SECONDS = 3600;

function secret(): string {
  const s = process.env.API_TOKEN_SECRET;
  if (!s) throw new Error("API_TOKEN_SECRET ist nicht gesetzt.");
  return s;
}

export function hashSecret(clientSecret: string): string {
  return createHash("sha256").update(clientSecret).digest("hex");
}

export function generateClientCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  return {
    clientId: `pxm_${randomBytes(12).toString("hex")}`,
    clientSecret: randomBytes(32).toString("hex"),
  };
}

function b64url(data: Buffer | string): string {
  return Buffer.from(data).toString("base64url");
}

export function signToken(payload: ApiTokenPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string): ApiTokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as ApiTokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000)
      return null;
    return payload;
  } catch {
    return null;
  }
}

/** Client-Credentials-Grant: prueft Client + Secret, stellt Token aus. */
export async function issueToken(
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  if (!hasDatabase()) return null;
  const [client] = await getDb()
    .select()
    .from(apiClients)
    .where(eq(apiClients.clientId, clientId))
    .limit(1);
  if (!client || !client.active) return null;

  const providedHash = Buffer.from(hashSecret(clientSecret));
  const storedHash = Buffer.from(client.clientSecretHash);
  if (
    providedHash.length !== storedHash.length ||
    !timingSafeEqual(providedHash, storedHash)
  )
    return null;

  const payload: ApiTokenPayload = {
    clientId: client.clientId,
    userId: client.userId,
    orgId: client.orgId,
    roles: client.roles,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  return { accessToken: signToken(payload), expiresIn: TOKEN_TTL_SECONDS };
}

/** Bearer-Token aus dem Authorization-Header pruefen (+ Rolle). */
export function authorizeRequest(
  req: Request,
  requiredRole: ApiRole,
): ApiTokenPayload | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const payload = verifyToken(match[1].trim());
  if (!payload) return null;
  if (!payload.roles.includes(requiredRole)) return null;
  return payload;
}
