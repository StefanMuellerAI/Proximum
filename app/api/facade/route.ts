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
import { PV_YIELD_BY_EIGNUNG } from "@/lib/data/reference";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.FACADE_MODEL || "claude-haiku-4-5";
const META_URL = "https://maps.googleapis.com/maps/api/streetview/metadata";
const IMG_URL = "https://maps.googleapis.com/maps/api/streetview";
const STATIC_URL = "https://maps.googleapis.com/maps/api/staticmap";

const SYSTEM_PROMPT = `Du bist Experte für Gebäude und erhältst bis zu zwei Bilder desselben Gebäudes:
BILD 1 = Straßenansicht (Fassade frontal), BILD 2 = schräges Luftbild (Dach + weitere Fassaden von oben).

Aufgaben:
- FENSTER-ZU-WAND-ANTEIL (WWR, %): Nutze ALLE verfügbaren Bilder gemeinsam. Die Straßenansicht
  zeigt eine Fassade frontal, das Schrägluftbild zeigt zusätzlich weitere Fassaden und deren
  Verglasung. Bilde daraus einen konsistenten Gesamt-WWR und beurteile Konfidenz, Bildqualität
  und Sichtbarkeit der Fassaden (über beide Bilder).
- PV: Dachausrichtung und PV-Eignung AUSSCHLIESSLICH aus dem Luftbild (BILD 2). Ohne Luftbild
  lass dach_ausrichtung/pv_eignung/pv_hinweise weg.

Türen zählen nicht als Fenster. Bewerte ehrlich; bei Verdeckung Konfidenz senken.`;

function fallback(reason: string): FacadeResult {
  return {
    source: "none",
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
    aerialSource: "none",
    aerialImageDataUrl: null,
    dachAusrichtung: null,
    pvEignung: null,
    pvYieldKwhPerM2: null,
    pvHinweise: null,
  };
}

function dataUrlToBytes(d: string): Uint8Array | null {
  const m = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(d);
  if (!m) return null;
  try {
    return new Uint8Array(Buffer.from(m[1], "base64"));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (process.env.FACADE_ENABLED === "false")
    return NextResponse.json(fallback("Feature deaktiviert"));
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json(fallback("Kein GOOGLE_MAPS_API_KEY"));

  let address: string | undefined;
  let lat: number | undefined;
  let lon: number | undefined;
  let aerialImageDataUrl: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.address === "string") address = body.address.trim();
    if (typeof body?.lat === "number") lat = body.lat;
    if (typeof body?.lon === "number") lon = body.lon;
    if (typeof body?.aerialImageDataUrl === "string")
      aerialImageDataUrl = body.aerialImageDataUrl;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  if (lat == null || lon == null) {
    if (!address)
      return NextResponse.json({ error: "address oder lat/lon nötig." }, { status: 400 });
    try {
      const geo = await geocode(address);
      if (!geo) return NextResponse.json(fallback("Adresse nicht geokodierbar"));
      lat = geo.lat;
      lon = geo.lon;
    } catch {
      return NextResponse.json(fallback("Geocoding fehlgeschlagen"));
    }
  }

  // --- Bild 1: Street View (Fassade) – optional ---
  let streetBytes: Uint8Array | null = null;
  let imageDataUrl: string | null = null;
  let heading: number | null = null;
  let panoId: string | null = null;
  let panoDate: string | null = null;
  let camLat: number | null = null;
  let camLon: number | null = null;
  let streetReason: string | null = null;
  try {
    const url = `${META_URL}?location=${lat},${lon}&radius=${FACADE_IMAGE.radius}&source=outdoor&key=${key}`;
    const meta = (await (await fetch(url)).json()) as {
      status: string;
      date?: string;
      pano_id?: string;
      location?: { lat: number; lng: number };
    };
    if (meta.status === "OK" && meta.pano_id && meta.location) {
      panoId = meta.pano_id;
      panoDate = meta.date ?? null;
      camLat = meta.location.lat;
      camLon = meta.location.lng;
      heading = Math.round((bearing(meta.location.lat, meta.location.lng, lat, lon) + 360) % 360);
      const imgUrl = `${IMG_URL}?size=${FACADE_IMAGE.size}&pano=${panoId}&heading=${heading}&pitch=${FACADE_IMAGE.pitch}&fov=${FACADE_IMAGE.fov}&source=outdoor&key=${key}`;
      const res = await fetch(imgUrl);
      if (res.ok) {
        streetBytes = new Uint8Array(await res.arrayBuffer());
        imageDataUrl = `data:image/jpeg;base64,${Buffer.from(streetBytes).toString("base64")}`;
      } else {
        streetReason = "Street-View-Bildabruf fehlgeschlagen";
      }
    } else {
      streetReason = `Kein Street-View-Bild (${meta.status})`;
    }
  } catch {
    streetReason = "Street-View-Abruf fehlgeschlagen";
  }

  // --- Bild 2: Luftbild (Client-3D-Schrägbild oder Satellit-Fallback) ---
  let aerialBytes: Uint8Array | null = null;
  let aerialSource: FacadeResult["aerialSource"] = "none";
  let aerialDisplay: string | null = null;
  if (aerialImageDataUrl) {
    aerialBytes = dataUrlToBytes(aerialImageDataUrl);
    if (aerialBytes) {
      aerialSource = "3d";
      aerialDisplay = aerialImageDataUrl;
    }
  }
  if (!aerialBytes) {
    try {
      const url = `${STATIC_URL}?center=${lat},${lon}&zoom=19&size=640x640&maptype=satellite&key=${key}`;
      const res = await fetch(url);
      if (res.ok) {
        aerialBytes = new Uint8Array(await res.arrayBuffer());
        aerialSource = "satellit";
        aerialDisplay = `data:image/jpeg;base64,${Buffer.from(aerialBytes).toString("base64")}`;
      }
    } catch {
      /* Satellit optional */
    }
  }

  if (!streetBytes && !aerialBytes)
    return NextResponse.json(fallback(streetReason ?? "Keine Bilder verfügbar"));

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(fallback("Kein ANTHROPIC_API_KEY für Bildanalyse"));

  // --- Vision: verfügbare Bilder in EINEM Call (WWR aus beiden, PV nur Luftbild) ---
  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: Uint8Array; mediaType: string }
  > = [
    {
      type: "text",
      text: "Analysiere die folgenden Bild(er) und fülle das Schema.",
    },
  ];
  if (streetBytes) {
    content.push({ type: "text", text: "BILD 1 – Straßenansicht (Fassade):" });
    content.push({ type: "file", data: streetBytes, mediaType: "image/jpeg" });
  }
  if (aerialBytes) {
    content.push({ type: "text", text: "BILD 2 – Luftbild (Dach + Fassaden von schräg/oben):" });
    content.push({ type: "file", data: aerialBytes, mediaType: "image/jpeg" });
  }

  let vision;
  try {
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema: facadeVisionSchema,
      schemaName: "FassadenLuftbildAnalyse",
      system: SYSTEM_PROMPT,
      temperature: 0,
      messages: [{ role: "user", content }],
    });
    vision = object;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Vision-Fehler";
    return NextResponse.json(fallback(`Bildanalyse fehlgeschlagen: ${msg}`));
  }

  const wwrOk = passesQualityGate(vision);
  const pvYieldKwhPerM2 = vision.pv_eignung
    ? PV_YIELD_BY_EIGNUNG[vision.pv_eignung]
    : null;

  const result: FacadeResult = {
    source: wwrOk ? "bild" : "typologie",
    wwrPercent: wwrOk ? Math.round(vision.fensteranteil_prozent) : null,
    konfidenz: vision.konfidenz,
    bildqualitaet: vision.bildqualitaet,
    sichtbareFassade: vision.sichtbare_fassade,
    hinweise: vision.hinweise,
    reason: wwrOk
      ? null
      : `WWR verworfen (Konfidenz ${vision.konfidenz}, Fassade ${vision.sichtbare_fassade})`,
    panoId,
    panoDate,
    camLat,
    camLon,
    heading,
    fov: FACADE_IMAGE.fov,
    pitch: FACADE_IMAGE.pitch,
    imageDataUrl,
    aerialSource,
    aerialImageDataUrl: aerialDisplay,
    dachAusrichtung: vision.dach_ausrichtung ?? null,
    pvEignung: vision.pv_eignung ?? null,
    pvYieldKwhPerM2,
    pvHinweise: vision.pv_hinweise ?? null,
  };

  return NextResponse.json(result);
}
