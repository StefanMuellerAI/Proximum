import { NextResponse } from "next/server";
import { normalizeExtraction } from "@/lib/schema";
import { extractEnergieausweis } from "@/lib/extraction";
import { getOwnerScope } from "@/lib/auth";
import { recordEvent } from "@/lib/db/events";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const scope = await getOwnerScope();
  if (!scope)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  const userId = scope.userId;
  const limit = await checkRateLimit("extract", userId);
  if (!limit.ok) return rateLimitResponse(limit);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY ist nicht gesetzt. Bitte in der Umgebung (.env.local) hinterlegen.",
      },
      { status: 500 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Request (multipart/form-data mit Feld 'file' erwartet)." },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json(
      { error: "Keine Datei hochgeladen (Feld 'file')." },
      { status: 400 },
    );
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Nur PDF-Dateien werden unterstützt." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Datei zu groß (max. 20 MB)." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const parsed = await extractEnergieausweis(bytes, file.name);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: `Extrahierte Daten unvollständig/ungültig: ${parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .slice(0, 5)
            .join("; ")}`,
        },
        { status: 422 },
      );
    }

    const normalized = normalizeExtraction(parsed.data);
    await recordEvent("document_processed", scope, {
      payload: { kind: "energieausweis", filename: file.name },
    });
    return NextResponse.json({ extraction: parsed.data, normalized });
  } catch (err) {
    console.error("Extraction failed:", err);
    const message =
      err instanceof Error ? err.message : "Unbekannter Fehler bei der Extraktion.";
    return NextResponse.json(
      { error: `Extraktion fehlgeschlagen: ${message}` },
      { status: 502 },
    );
  }
}
