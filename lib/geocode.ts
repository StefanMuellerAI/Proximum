/**
 * Geteilte Geokodierung & Geometrie-Helfer (Server).
 * Wird von der Risiko-API und der Fassaden-API gemeinsam genutzt.
 */
import proj4 from "proj4";

const UTM32 =
  "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  strasseHausnummer: string;
  plz: string;
  ort: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    road?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    suburb?: string;
  };
}

const STREET_RE =
  /([A-Za-zÄÖÜäöüß.\-]+(?:straße|strasse|str\.?|weg|platz|allee|gasse|ring|damm|ufer|chaussee|steig|hof)\s+\d+\s*[a-z]?)/i;

/**
 * Bereinigt eine Adresse mit Namens-/Objektpraefix ("Liegenschaft XY ...") zu
 * "Straße Nr, PLZ Ort", damit Nominatim sie aufloesen kann.
 */
function cleanAddress(address: string): string | null {
  const plz = address.match(/(\d{5})\s+([A-Za-zÄÖÜäöüß.\- ]+)/);
  if (!plz) return null;
  const ort = plz[2].split(/[,;]/)[0].trim();
  const before = address.slice(0, plz.index).replace(/[,;]\s*$/, "").trim();
  const streetMatch = before.match(STREET_RE);
  const street = streetMatch
    ? streetMatch[1].trim()
    : (before.split(/[,;]/).pop() ?? before).trim();
  const q = `${street}, ${plz[1]} ${ort}`;
  return q;
}

/** Grobe Rueckfalloption: nur PLZ + Ort (Stadtebene). */
function plzOrt(address: string): string | null {
  const m = address.match(/(\d{5})\s+([A-Za-zÄÖÜäöüß.\- ]+)/);
  if (!m) return null;
  return `${m[1]} ${m[2].split(/[,;]/)[0].trim()}`;
}

async function geocodeOne(query: string): Promise<GeocodeResult | null> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(
    query,
  )}&format=jsonv2&addressdetails=1&countrycodes=de&limit=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Proximum-ESG/1.0 (Energieausweis-Analyse)",
      "Accept-Language": "de",
    },
  });
  if (!res.ok) throw new Error(`Geocoding fehlgeschlagen (${res.status})`);
  const data = (await res.json()) as NominatimResult[];
  const g = data[0];
  if (!g) return null;
  const a = g.address ?? {};
  return {
    lat: Number(g.lat),
    lon: Number(g.lon),
    displayName: g.display_name,
    strasseHausnummer: [a.road, a.house_number].filter(Boolean).join(" "),
    plz: a.postcode ?? "",
    ort: a.city || a.town || a.village || a.municipality || a.suburb || "",
  };
}

/**
 * Adresse -> Koordinaten. Versucht mehrere Varianten (Original, ohne
 * Objekt-/Namenspraefix, PLZ+Ort), da Ausweisadressen oft Zusatztext enthalten.
 */
export async function geocode(address: string): Promise<GeocodeResult | null> {
  const candidates = [address, cleanAddress(address), plzOrt(address)].filter(
    (x): x is string => !!x,
  );
  const seen = new Set<string>();
  for (const q of candidates) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = await geocodeOne(q);
    if (r) return r;
  }
  return null;
}

/** WGS84 (lat/lon) -> UTM32 (EPSG:25832), gerundete Meter. */
export function toUtm32(lat: number, lon: number): { xUtm: number; yUtm: number } {
  const [x, y] = proj4("EPSG:4326", UTM32, [lon, lat]);
  return { xUtm: Math.round(x), yUtm: Math.round(y) };
}

/**
 * Initial-Bearing (Peilung) von Kamera -> Ziel in Grad (0-360, 0 = Norden).
 * Wird genutzt, damit die Street-View-Kamera auf die Fassade zeigt.
 */
export function bearing(
  camLat: number,
  camLon: number,
  targetLat: number,
  targetLon: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(camLat);
  const phi2 = toRad(targetLat);
  const dLambda = toRad(targetLon - camLon);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Grad-Distanz zwischen zwei Koordinaten in Metern (Haversine). */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
