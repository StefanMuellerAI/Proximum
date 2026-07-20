import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { geocode } from "@/lib/geocode";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * POST: Adresse -> Koordinaten (fuer den Anlage-Wizard, A6).
 * Body: { address } -> { lat, lon, praezision, displayName }
 */
export async function POST(req: Request) {
  const userId = await requireUser();
  if (!userId)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  const limit = await checkRateLimit("risk", userId);
  if (!limit.ok) return rateLimitResponse(limit);

  let address: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.address === "string") address = body.address;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  if (!address?.trim())
    return NextResponse.json({ error: "address fehlt." }, { status: 400 });

  try {
    const result = await geocode(address);
    if (!result)
      return NextResponse.json(
        { error: "Adresse konnte nicht aufgelöst werden." },
        { status: 404 },
      );
    return NextResponse.json({
      lat: result.lat,
      lon: result.lon,
      praezision: result.praezision,
      displayName: result.displayName,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Geocoding fehlgeschlagen." },
      { status: 502 },
    );
  }
}
