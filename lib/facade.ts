/**
 * Typen, Vision-Schema und Qualitaets-Gate fuer die Fassaden-/WWR-Analyse.
 * Wird von der Fassaden-API (Server) und dem Dashboard (Client) genutzt.
 *
 * Determinismus: Als Vision-Eingabe dient AUSSCHLIESSLICH das Street-View-
 * Static-Bild (fixes pano_id/heading/fov -> reproduzierbare Bytes). Die
 * PV-Aussage kommt datenbasiert aus der Google Solar API (lib/solar.ts),
 * nicht mehr aus einer LLM-Bildschaetzung.
 */
import { z } from "zod";
import type { SolarInfo } from "@/lib/solar";

/** Bildparameter fuer den Street-View-Static-Abruf. */
export const FACADE_IMAGE = {
  size: "640x640",
  pitch: 10,
  fov: 65,
  radius: 50,
} as const;

/** Erzwungenes JSON-Schema, das das Vision-Modell zurueckgeben muss. */
export const facadeVisionSchema = z.object({
  fensteranteil_prozent: z
    .number()
    .min(0)
    .max(100)
    .describe("Fenster-zu-Wand-Anteil in % der sichtbaren Fassade"),
  konfidenz: z
    .enum(["hoch", "mittel", "gering"])
    .describe("Sicherheit der WWR-Schätzung"),
  bildqualitaet: z
    .enum(["gut", "teilweise verdeckt", "schlecht"])
    .describe("Qualität des Fassadenbilds"),
  sichtbare_fassade: z
    .enum(["voll", "teilweise", "kaum"])
    .describe("Wie vollständig ist die Fassade sichtbar?"),
  hinweise: z.string().describe("Kurzer Hinweis zur Fassade (Bäume/Autos/Winkel)"),
});

export type FacadeVision = z.infer<typeof facadeVisionSchema>;

export type FacadeSource = "bild" | "typologie" | "none";

export interface FacadeResult {
  /** "bild" = verlässliche Bild-Schätzung; "typologie" = Bild verworfen; "none" = kein Bild/kein Key. */
  source: FacadeSource;
  /** WWR aus dem Bild, auf 5-%-Stufen gerundet (nur bei source === "bild"). */
  wwrPercent: number | null;
  konfidenz: FacadeVision["konfidenz"] | null;
  bildqualitaet: FacadeVision["bildqualitaet"] | null;
  sichtbareFassade: FacadeVision["sichtbare_fassade"] | null;
  hinweise: string | null;
  /** Grund fuer Fallback (z. B. "ZERO_RESULTS", "Konfidenz gering"). */
  reason: string | null;
  // Nachvollziehbarkeit / Cache-Schluessel
  panoId: string | null;
  panoDate: string | null;
  camLat: number | null;
  camLon: number | null;
  heading: number | null;
  fov: number;
  pitch: number;
  /** Base64-Fassadenbild (Street View) zur Anzeige (ohne API-Key). */
  imageDataUrl: string | null;

  /** PV-Potenzial aus der Google Solar API (datenbasiert, deterministisch). */
  solar: SolarInfo | null;
}

/**
 * Qualitaets-Gate: Nur verlaessliche Bilder als "bild" akzeptieren.
 * Klar unbrauchbare Bilder werden verworfen.
 */
export function passesQualityGate(v: FacadeVision): boolean {
  return (
    v.konfidenz !== "gering" &&
    v.sichtbare_fassade !== "kaum" &&
    v.bildqualitaet !== "schlecht"
  );
}

/**
 * Rundet den Vision-WWR auf 5-%-Stufen, damit Restschwankungen des Modells
 * (z. B. 31 vs. 33 %) nicht zu unterschiedlichen Endergebnissen fuehren.
 * Die Typologie-Defaults (TYPICAL_WWR) sind bereits Vielfache von 5.
 */
export function roundWwrToStep(wwrPercent: number): number {
  return Math.min(100, Math.max(0, Math.round(wwrPercent / 5) * 5));
}
