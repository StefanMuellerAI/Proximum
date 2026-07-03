import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { geocode, bearing } from "@/lib/geocode";
import {
  FACADE_IMAGE,
  facadeVisionSchema,
  passesQualityGate,
  type FacadeResult,
} from "@/lib/facade";

export const runtime = "nodejs";
export const maxDuration = 45;

const MODEL = process.env.FACADE_MODEL || "claude-haiku-4-5";
const META_URL = "https://maps.googleapis.com/maps/api/streetview/metadata";
const IMG_URL = "https://maps.googleapis.com/maps/api/streetview";

const SYSTEM_PROMPT = `Du bist Experte für Gebäudefassaden. Schätze aus dem Foto den
Fenster-zu-Wand-Anteil (WWR = window-to-wall ratio) der SICHTBAREN Hauptfassade in Prozent
(Fensterfläche geteilt durch gesamte Fassadenfläche der sichtbaren Wand).

Regeln:
- Beziehe dich nur auf die klar erkennbare Fassade des Zielgebäudes, nicht auf Nachbargebäude.
- Türen zählen nicht als Fenster.
- Beurteile ehrlich Bildqualität und wie vollständig die Fassade sichtbar ist.
- Bei Verdeckung (Bäume, Autos, schräger Winkel) Konfidenz entsprechend senken.`;

/** Weiche Fehler geben source:"none"/"typologie" mit 200 zurueck, damit die UI auf Typologie faellt. */
function fallback(reason: string, source: FacadeResult["source"] = "none"): FacadeResult {
  return {
    source,
    wwrPercent: null,
    konfidenz: null,
    bildqualitaet: null,
    sichtbareFassade: null,
    hinweise: null,
    reason,
    panoId: null,
    panoDate: null,
    camLat: null,
    camLon: null,
    heading: null,
    fov: FACADE_IMAGE.fov,
    pitch: FACADE_IMAGE.pitch,
    imageDataUrl: null,
  };
}

export async function POST(req: Request) {
  if (process.env.FACADE_ENABLED === "false") {
    return NextResponse.json(fallback("Feature deaktiviert"));
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(fallback("Kein GOOGLE_MAPS_API_KEY konfiguriert"));
  }

  let address: string | undefined;
  let lat: number | undefined;
  let lon: number | undefined;
  try {
    const body = await req.json();
    if (typeof body?.address === "string") address = body.address.trim();
    if (typeof body?.lat === "number") lat = body.lat;
    if (typeof body?.lon === "number") lon = body.lon;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  // Koordinaten sicherstellen (vorhandene nutzen, sonst 1x geocoden)
  if (lat == null || lon == null) {
    if (!address) {
      return NextResponse.json(
        { error: "address oder lat/lon erforderlich." },
        { status: 400 },
      );
    }
    try {
      const geo = await geocode(address);
      if (!geo) return NextResponse.json(fallback("Adresse nicht geokodierbar"));
      lat = geo.lat;
      lon = geo.lon;
    } catch {
      return NextResponse.json(fallback("Geocoding fehlgeschlagen"));
    }
  }

  // 1) Metadata (gratis): existiert ein Panorama?
  let meta: {
    status: string;
    date?: string;
    pano_id?: string;
    location?: { lat: number; lng: number };
  };
  try {
    const url = `${META_URL}?location=${lat},${lon}&radius=${FACADE_IMAGE.radius}&source=outdoor&key=${key}`;
    const res = await fetch(url);
    meta = await res.json();
  } catch {
    return NextResponse.json(fallback("Metadata-Abruf fehlgeschlagen"));
  }
  if (meta.status !== "OK" || !meta.pano_id || !meta.location) {
    return NextResponse.json(fallback(`Kein Street-View-Bild (${meta.status})`));
  }

  // 2) Heading: von echter Kameraposition auf das Gebaeude
  const heading = Math.round(
    (bearing(meta.location.lat, meta.location.lng, lat, lon) + 360) % 360,
  );

  // 3) Bild (kostenpflichtig) laden
  let imageBytes: Uint8Array;
  try {
    const url = `${IMG_URL}?size=${FACADE_IMAGE.size}&pano=${meta.pano_id}&heading=${heading}&pitch=${FACADE_IMAGE.pitch}&fov=${FACADE_IMAGE.fov}&source=outdoor&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    imageBytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    return NextResponse.json(fallback("Bildabruf fehlgeschlagen"));
  }
  const imageDataUrl = `data:image/jpeg;base64,${Buffer.from(imageBytes).toString("base64")}`;

  // 4) Vision-Modell: WWR schaetzen
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(fallback("Kein ANTHROPIC_API_KEY für Bildanalyse"));
  }
  let vision;
  try {
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema: facadeVisionSchema,
      schemaName: "FassadenAnalyse",
      system: SYSTEM_PROMPT,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Schätze den Fenster-zu-Wand-Anteil (WWR) dieser Fassade und beurteile Bildqualität und Sichtbarkeit.",
            },
            { type: "image", image: imageBytes, mediaType: "image/jpeg" },
          ],
        },
      ],
    });
    vision = object;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Vision-Fehler";
    return NextResponse.json(fallback(`Bildanalyse fehlgeschlagen: ${msg}`));
  }

  // 5) Quality-Gate
  const ok = passesQualityGate(vision);
  const base: FacadeResult = {
    source: ok ? "bild" : "typologie",
    wwrPercent: ok ? Math.round(vision.fensteranteil_prozent) : null,
    konfidenz: vision.konfidenz,
    bildqualitaet: vision.bildqualitaet,
    sichtbareFassade: vision.sichtbare_fassade,
    hinweise: vision.hinweise,
    reason: ok
      ? null
      : `Bild verworfen (Konfidenz ${vision.konfidenz}, Fassade ${vision.sichtbare_fassade})`,
    panoId: meta.pano_id,
    panoDate: meta.date ?? null,
    camLat: meta.location.lat,
    camLon: meta.location.lng,
    heading,
    fov: FACADE_IMAGE.fov,
    pitch: FACADE_IMAGE.pitch,
    imageDataUrl,
  };

  return NextResponse.json(base);
}
