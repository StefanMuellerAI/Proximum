import { auth, clerkClient } from "@clerk/nextjs/server";

/**
 * Prueft, ob der eingeloggte User Admin ist (Clerk publicMetadata.role).
 * Liest bevorzugt die Session-Claims (kein Backend-Roundtrip); Fallback auf
 * die Backend-API, falls die Claims (noch) keine Rolle enthalten.
 * Gibt die userId zurueck oder null (nicht eingeloggt / kein Admin).
 */
export async function requireAdmin(): Promise<string | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const claims = sessionClaims as
    | { role?: unknown; metadata?: { role?: unknown } }
    | null
    | undefined;
  const claimRole = claims?.role ?? claims?.metadata?.role;
  if (typeof claimRole === "string") {
    return claimRole === "admin" ? userId : null;
  }

  // Fallback: Claims nicht konfiguriert -> Backend-API
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.publicMetadata?.role === "admin" ? userId : null;
}

/** Gibt die userId des eingeloggten Users zurueck oder null. */
export async function requireUser(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Eigentums-Scope fuer Gebaeude: aktive Clerk-Organisation (Mandant) oder
 * persoenlicher Bereich des Users (orgId = null).
 */
export interface OwnerScope {
  userId: string;
  orgId: string | null;
}

export async function getOwnerScope(): Promise<OwnerScope | null> {
  const { userId, orgId } = await auth();
  if (!userId) return null;
  return { userId, orgId: orgId ?? null };
}
