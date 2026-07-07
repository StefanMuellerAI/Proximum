import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { and, eq } from "drizzle-orm";
import { geocode, bearing, type GeocodePrecision } from "@/lib/geocode";
import {
  FACADE_IMAGE,
  facadeVisionSchema,
  passesQualityGate,
  roundWwrToStep,
  type FacadeResult,
} from "@/lib/facade";
import { fetchSolarInfo, solarUnavailable, type SolarInfo } from "@/lib/solar";
import { getDb, hasDatabase } from "@/lib/db";
import { buildings } from "@/lib/db/schema";
import { scopeFilter } from "@/lib/db/scope";
import { getOwnerScope, requireUser } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.FACADE_MODEL || "claude-haiku-4-5";
const META_URL = "https://maps.googleapis.com/maps/api/streetview/metadata";
const IMG_URL = "https://maps.googleapis.com/maps/api/streetview";

const SYSTEM_PROMPT = `Du bist Experte für Gebäude und erhältst EIN Bild: die Straßenansicht (Fassade frontal).

Aufgabe: Schätze den FENSTER-ZU-WAND-ANTEIL (WWR, %) der sichtbaren Fassade und
beurteile Konfidenz, Bildqualität und Sichtbarkeit der Fassade.

Türen zählen nicht als Fenster. Bewerte ehrlich; bei Verdeckung Konfidenz senken.
Antworte reproduzierbar: gleiches Bild -> gleiche Werte.`;

function fallback(reason: string, solar: SolarInfo | null = null): FacadeResult {
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
    solar,
  };
}

export async function POST(req: Request) {
  const authedUserId = await requireUser();
  if (!authedUserId)
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  const limit = await checkRateLimit("facade", authedUserId);
  if (!limit.ok) return rateLimitResponse(limit);

  if (process.env.FACADE_ENABLED === "false")
    return NextResponse.json(fallback("Feature deaktiviert"));
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json(fallback("Kein GOOGLE_MAPS_API_KEY"));

  let address: string | undefined;
  let lat: number | undefined;
  let lon: number | undefined;
  let praezision: GeocodePrecision | undefined;
  let buildingId: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.address === "string") address = body.address.trim();
    if (typeof body?.lat === "number") lat = body.lat;
    if (typeof body?.lon === "number") lon = body.lon;
    if (
      body?.praezision === "adresse" ||
      body?.praezision === "strasse" ||
      body?.praezision === "ort"
    )
      praezision = body.praezision;
    if (typeof body?.buildingId === "string") buildingId = body.buildingId;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  // DB-Cache laden (Re-Fetch nur wenn leer, pano_date geaendert oder noch
  // ohne Solar-Daten aus der alten Pipeline)
  const scope = buildingId && hasDatabase() ? await getOwnerScope() : null;
  let cachedFacade: FacadeResult | null = null;
  let cachedPanoDate: string | null = null;
  if (buildingId && scope) {
    try {
      const [row] = await getDb()
        .select({
          facadeResult: buildings.facadeResult,
          facadePanoDate: buildings.facadePanoDate,
        })
        .from(buildings)
        .where(and(eq(buildings.id, buildingId), scopeFilter(scope)))
        .limit(1);
      cachedFacade = row?.facadeResult ?? null;
      cachedPanoDate = row?.facadePanoDate ?? null;
    } catch {
      // Cache-Fehler ignorieren
    }
  }
  // Cache-Eintraege der alten Pipeline (ohne solar-Feld) nicht wiederverwenden
  const cacheUsable = cachedFacade != null && cachedFacade.solar !== undefined;

  if (lat == null || lon == null) {
    if (!address)
      return NextResponse.json({ error: "address oder lat/lon nötig." }, { status: 400 });
    try {
      const geo = await geocode(address);
      if (!geo) return NextResponse.json(fallback("Adresse nicht geokodierbar"));
      lat = geo.lat;
      lon = geo.lon;
      praezision = geo.praezision;
    } catch {
      return NextResponse.json(fallback("Geocoding fehlgeschlagen"));
    }
  }

  // Praezisions-Gate: Bei Stadt-/PLZ-Aufloesung wuerden Street View und
  // Solar API ein fremdes Gebaeude bewerten -> sauber auf Defaults ausweisen.
  if (praezision === "ort") {
    return NextResponse.json(
      fallback(
        "Adresse nur auf PLZ/Ort-Ebene auflösbar – gebäudescharfe Analyse übersprungen",
        solarUnavailable("Adresse nur auf PLZ/Ort-Ebene auflösbar"),
      ),
    );
  }

  // --- PV: Google Solar API (datenbasiert, deterministisch) ---
  const solar = await fetchSolarInfo(lat, lon, key);

  // --- Street-View-Bild (fixes pano_id/heading -> reproduzierbar) ---
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

      // Cache-Treffer: gleiches Panorama wie beim letzten Abruf -> kein
      // erneuter (bezahlter) Bildabruf und keine erneute Vision-Analyse.
      if (cacheUsable && cachedPanoDate && panoDate === cachedPanoDate) {
        return NextResponse.json(cachedFacade);
      }

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

  // Kein (neues) Street-View-Bild verfuegbar, aber brauchbarer Cache -> Cache
  // liefern statt Vision erneut zu bezahlen.
  if (cacheUsable && !streetBytes) return NextResponse.json(cachedFacade);

  if (!streetBytes)
    return NextResponse.json(fallback(streetReason ?? "Kein Fassadenbild verfügbar", solar));

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(fallback("Kein ANTHROPIC_API_KEY für Bildanalyse", solar));

  // --- Vision: WWR aus dem Street-View-Bild (temperature 0) ---
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
            { type: "text", text: "Analysiere die Fassade und fülle das Schema." },
            { type: "file", data: streetBytes, mediaType: "image/jpeg" },
          ],
        },
      ],
    });
    vision = object;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Vision-Fehler";
    return NextResponse.json(fallback(`Bildanalyse fehlgeschlagen: ${msg}`, solar));
  }

  const wwrOk = passesQualityGate(vision);

  const result: FacadeResult = {
    source: wwrOk ? "bild" : "typologie",
    wwrPercent: wwrOk ? roundWwrToStep(vision.fensteranteil_prozent) : null,
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
    solar,
  };

  // Ergebnis im Gebaeude cachen (pano_date als Cache-Schluessel)
  if (buildingId && scope) {
    try {
      await getDb()
        .update(buildings)
        .set({
          facadeResult: result,
          facadePanoDate: panoDate,
          cachedAt: new Date(),
        })
        .where(and(eq(buildings.id, buildingId), scopeFilter(scope)));
    } catch {
      // Cache-Schreiben best effort
    }
  }

  return NextResponse.json(result);
}
