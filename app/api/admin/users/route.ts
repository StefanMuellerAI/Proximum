import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

export const runtime = "nodejs";

export interface AdminUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  banned: boolean;
  lastSignInAt: number | null;
  createdAt: number;
}

function toAdminUser(u: {
  id: string;
  emailAddresses: { emailAddress: string }[];
  firstName: string | null;
  lastName: string | null;
  publicMetadata: Record<string, unknown>;
  banned: boolean;
  lastSignInAt: number | null;
  createdAt: number;
}): AdminUser {
  return {
    id: u.id,
    email: u.emailAddresses[0]?.emailAddress ?? null,
    firstName: u.firstName,
    lastName: u.lastName,
    role: typeof u.publicMetadata?.role === "string" ? u.publicMetadata.role : null,
    banned: u.banned,
    lastSignInAt: u.lastSignInAt,
    createdAt: u.createdAt,
  };
}

/** GET: Liste aller User (nur Admin). */
export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Nur für Admins." }, { status: 403 });

  const client = await clerkClient();
  const { data } = await client.users.getUserList({
    limit: 200,
    orderBy: "-created_at",
  });
  return NextResponse.json({ users: data.map(toAdminUser) });
}

/**
 * POST: User anlegen (nur Admin).
 * Body: { email, firstName?, lastName?, password? }
 * Mit Passwort -> direktes Anlegen; ohne -> E-Mail-Einladung (Clerk Invitation).
 */
export async function POST(req: Request) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Nur für Admins." }, { status: 403 });
  const limit = await checkRateLimit("adminCreate", adminId);
  if (!limit.ok) return rateLimitResponse(limit);

  let body: {
    email?: string;
    firstName?: string;
    lastName?: string;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "Gültige E-Mail-Adresse nötig." }, { status: 400 });

  const client = await clerkClient();
  try {
    if (body.password) {
      const user = await client.users.createUser({
        emailAddress: [email],
        firstName: body.firstName?.trim() || undefined,
        lastName: body.lastName?.trim() || undefined,
        password: body.password,
      });
      return NextResponse.json({ created: toAdminUser(user), mode: "create" });
    }
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      notify: true,
      ignoreExisting: true,
    });
    return NextResponse.json({
      invited: { id: invitation.id, email: invitation.emailAddress },
      mode: "invite",
    });
  } catch (err) {
    const msg =
      err && typeof err === "object" && "errors" in err
        ? (err as { errors: { message: string }[] }).errors
            .map((e) => e.message)
            .join("; ")
        : err instanceof Error
          ? err.message
          : "Clerk-Fehler";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
