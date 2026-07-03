import { NextResponse } from "next/server";
import { geocode, toUtm32, type GeocodeResult } from "@/lib/geocode";
import {
  categorize,
  levelFromValue,
  timeframeFromLabel,
  type Hazard,
  type RiskResult,
} from "@/lib/risk";

export const runtime = "nodejs";
export const maxDuration = 30;

const HAZARD_API = "https://www.gisimmorisknaturgefahren.de/Standortsteckbrief";

export async function POST(req: Request) {
  let address: string | undefined;
  try {
    const body = await req.json();
    address = typeof body?.address === "string" ? body.address.trim() : undefined;
  } catch {
    return NextResponse.json({ error: "JSON-Body mit 'address' erwartet." }, { status: 400 });
  }
  if (!address) {
    return NextResponse.json({ error: "Keine Adresse übergeben." }, { status: 400 });
  }

  let geo: GeocodeResult | null;
  try {
    geo = await geocode(address);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Geocoding-Fehler";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  if (!geo) {
    return NextResponse.json(
      { error: "Adresse konnte nicht geokodiert werden." },
      { status: 404 },
    );
  }

  const { xUtm, yUtm } = toUtm32(geo.lat, geo.lon);

  const params = new URLSearchParams({
    strasseHausnummer: geo.strasseHausnummer || address,
    plz: geo.plz,
    ort: geo.ort,
    geogrBreite: String(geo.lat),
    geogrLaenge: String(geo.lon),
    xUtm: String(xUtm),
    yUtm: String(yUtm),
  });

  let raw: { gefaehrdungen?: (RawHazard | null)[] };
  try {
    const res = await fetch(`${HAZARD_API}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Gefahren-API-Fehler (${res.status})`);
    raw = await res.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gefahren-API-Fehler";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const hazards: Hazard[] = (raw.gefaehrdungen ?? [])
    .filter((h): h is RawHazard => h != null)
    .map((h) => ({
      gruppe: h.gruppe,
      label: h.label,
      anzeigewert: h.anzeigewert,
      unsicherheitsgrad: h.unsicherheitsgrad,
      unsicherheitstext: h.unsicherheitstext,
      category: categorize(h.gruppe),
      timeframe: timeframeFromLabel(h.label),
      level: levelFromValue(h.anzeigewert),
    }));

  const groups: Record<string, Hazard[]> = {};
  for (const h of hazards) (groups[h.gruppe] ??= []).push(h);

  const result: RiskResult = {
    location: {
      lat: geo.lat,
      lon: geo.lon,
      xUtm,
      yUtm,
      strasseHausnummer: geo.strasseHausnummer,
      plz: geo.plz,
      ort: geo.ort,
      matchedLabel: geo.displayName,
    },
    hazards,
    groups,
  };

  return NextResponse.json(result);
}

interface RawHazard {
  gruppe: string;
  label: string;
  anzeigewert: number;
  unsicherheitsgrad: number;
  unsicherheitstext: string;
}
