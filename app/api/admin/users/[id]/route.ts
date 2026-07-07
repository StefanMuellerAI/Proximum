import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

/** PATCH: User sperren/entsperren oder Rolle setzen (nur Admin). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Nur für Admins." }, { status: 403 });

  const { id } = await params;
  let body: { action?: "ban" | "unban" | "makeAdmin" | "removeAdmin" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  if (id === adminId && (body.action === "ban" || body.action === "removeAdmin"))
    return NextResponse.json(
      { error: "Eigenes Admin-Konto kann nicht gesperrt/herabgestuft werden." },
      { status: 400 },
    );

  const client = await clerkClient();
  try {
    switch (body.action) {
      case "ban":
        await client.users.banUser(id);
        break;
      case "unban":
        await client.users.unbanUser(id);
        break;
      case "makeAdmin":
        await client.users.updateUserMetadata(id, {
          publicMetadata: { role: "admin" },
        });
        break;
      case "removeAdmin":
        await client.users.updateUserMetadata(id, {
          publicMetadata: { role: null },
        });
        break;
      default:
        return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Clerk-Fehler";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}

/** DELETE: User endgueltig loeschen (nur Admin). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Nur für Admins." }, { status: 403 });

  const { id } = await params;
  if (id === adminId)
    return NextResponse.json(
      { error: "Eigenes Admin-Konto kann nicht gelöscht werden." },
      { status: 400 },
    );

  const client = await clerkClient();
  try {
    await client.users.deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Clerk-Fehler";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
