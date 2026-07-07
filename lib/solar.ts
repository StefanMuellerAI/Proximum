/**
 * Google Solar API (buildingInsights): datenbasierte, deterministische
 * PV-Aussage je Gebaeude (Dachflaeche, Sonnenstunden, Jahresertrag) statt
 * einer LLM-Bildschaetzung. Gleiche Anfrage -> gleiche Antwort; Aenderungen
 * nur bei neuen Befliegungen (sichtbar ueber imageryDate/imageryQuality).
 */
import { distanceMeters } from "@/lib/geocode";

const SOLAR_URL = "https://solar.googleapis.com/v1/buildingInsights:findClosest";

/** Max. Distanz zwischen angefragter Koordinate und Solar-Gebaeude. */
export const SOLAR_MAX_DISTANCE_M = 50;

/** Obergrenze fuer den PV-Ertrag bezogen auf die Bezugsflaeche (kWh/m²·a). */
export const PV_YIELD_CAP_KWH_M2A = 35;

/** DC -> AC inkl. Systemverluste (Wechselrichter, Verkabelung, Verschmutzung). */
export const DC_TO_AC_FACTOR = 0.85;

export type SolarEignung = "hoch" | "mittel" | "gering";

export interface SolarInfo {
  status: "ok" | "unavailable";
  /** DC-Jahresertrag der groessten sinnvollen Panel-Konfiguration (kWh/a). */
  yearlyEnergyDcKwh: number | null;
  /** Nutzbare Dachflaeche fuer PV (m²). */
  roofAreaM2: number | null;
  maxSunshineHoursPerYear: number | null;
  /** Anzeige-Eignung, deterministisch aus Sonnenstunden abgeleitet. */
  eignung: SolarEignung | null;
  imageryQuality: string | null;
  /** Befliegungsdatum (YYYY-MM-DD) – Nachvollziehbarkeit bei Datenupdates. */
  imageryDate: string | null;
  /** Grund, falls keine Daten (keine Abdeckung, zu weit entfernt, API-Fehler). */
  reason: string | null;
}

export function solarUnavailable(reason: string): SolarInfo {
  return {
    status: "unavailable",
    yearlyEnergyDcKwh: null,
    roofAreaM2: null,
    maxSunshineHoursPerYear: null,
    eignung: null,
    imageryQuality: null,
    imageryDate: null,
    reason,
  };
}

/**
 * Anzeige-Eignung aus den jaehrlichen Sonnenstunden des Dachs.
 * Schwellen orientiert an deutschen Verhaeltnissen (~900-1200 h/a).
 */
export function classifySolarEignung(sunshineHours: number): SolarEignung {
  if (sunshineHours >= 1050) return "hoch";
  if (sunshineHours >= 900) return "mittel";
  return "gering";
}

/**
 * Mappt den Solar-Jahresertrag auf die Engine-Groesse "kWh/m²·a bezogen auf
 * die Bezugsflaeche" (Bedeutung wie bisher PV_YIELD_BY_EIGNUNG). AC-Faktor und
 * Cap halten die Annahme konservativ und im bisherigen Wertebereich.
 */
export function pvYieldFromSolar(
  solar: SolarInfo | null | undefined,
  bezugsflaecheM2: number | null,
): number | null {
  if (!solar || solar.status !== "ok" || solar.yearlyEnergyDcKwh == null)
    return null;
  if (bezugsflaecheM2 == null || bezugsflaecheM2 <= 0) return null;
  const perM2 = (solar.yearlyEnergyDcKwh * DC_TO_AC_FACTOR) / bezugsflaecheM2;
  return Math.min(PV_YIELD_CAP_KWH_M2A, Math.max(0, Math.round(perM2)));
}

/** Relevante Felder der buildingInsights-Antwort. */
interface BuildingInsightsResponse {
  center?: { latitude: number; longitude: number };
  imageryQuality?: string;
  imageryDate?: { year: number; month: number; day: number };
  solarPotential?: {
    maxArrayAreaMeters2?: number;
    maxSunshineHoursPerYear?: number;
    solarPanelConfigs?: { yearlyEnergyDcKwh?: number }[];
  };
}

/** Prueft, ob das gefundene Solar-Gebaeude zur angefragten Koordinate passt. */
export function withinSolarDistance(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
): boolean {
  return distanceMeters(lat, lon, centerLat, centerLon) <= SOLAR_MAX_DISTANCE_M;
}

/** Extrahiert die SolarInfo aus einer buildingInsights-Antwort (pur, testbar). */
export function mapBuildingInsights(
  data: BuildingInsightsResponse,
  lat: number,
  lon: number,
): SolarInfo {
  const center = data.center;
  if (
    center &&
    !withinSolarDistance(lat, lon, center.latitude, center.longitude)
  ) {
    return solarUnavailable(
      "Nächstes Solar-Gebäude liegt zu weit von der Adresse entfernt",
    );
  }
  const pot = data.solarPotential;
  if (!pot) return solarUnavailable("Keine Solarpotenzial-Daten für dieses Gebäude");

  // Groesste Konfiguration = maximaler Jahresertrag des Dachs
  const configs = pot.solarPanelConfigs ?? [];
  let yearly: number | null = null;
  for (const c of configs) {
    if (c.yearlyEnergyDcKwh != null)
      yearly = Math.max(yearly ?? 0, c.yearlyEnergyDcKwh);
  }

  const sunshine = pot.maxSunshineHoursPerYear ?? null;
  const d = data.imageryDate;
  return {
    status: "ok",
    yearlyEnergyDcKwh: yearly != null ? Math.round(yearly) : null,
    roofAreaM2:
      pot.maxArrayAreaMeters2 != null
        ? Math.round(pot.maxArrayAreaMeters2)
        : null,
    maxSunshineHoursPerYear: sunshine != null ? Math.round(sunshine) : null,
    eignung: sunshine != null ? classifySolarEignung(sunshine) : null,
    imageryQuality: data.imageryQuality ?? null,
    imageryDate: d
      ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
      : null,
    reason: null,
  };
}

/** Ruft die Solar API auf. Fehler werden als "unavailable" mit Grund gemappt. */
export async function fetchSolarInfo(
  lat: number,
  lon: number,
  apiKey: string,
): Promise<SolarInfo> {
  const url =
    `${SOLAR_URL}?location.latitude=${lat}&location.longitude=${lon}` +
    `&requiredQuality=MEDIUM&key=${apiKey}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return solarUnavailable("Solar API nicht erreichbar");
  }
  if (res.status === 404)
    return solarUnavailable("Keine Solar-Abdeckung an diesem Standort");
  if (!res.ok) return solarUnavailable(`Solar API Fehler (HTTP ${res.status})`);
  try {
    const data = (await res.json()) as BuildingInsightsResponse;
    return mapBuildingInsights(data, lat, lon);
  } catch {
    return solarUnavailable("Solar API Antwort nicht lesbar");
  }
}
