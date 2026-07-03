/**
 * Typen, Vision-Schema und Qualitaets-Gate fuer die Fassaden-/WWR-Analyse.
 * Wird von der Fassaden-API (Server) und dem Dashboard (Client) genutzt.
 */
import { z } from "zod";

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
    .describe("Geschätzter Fenster-zu-Wand-Anteil der sichtbaren Fassade in Prozent"),
  konfidenz: z
    .enum(["hoch", "mittel", "gering"])
    .describe("Wie sicher ist die Schätzung?"),
  bildqualitaet: z
    .enum(["gut", "teilweise verdeckt", "schlecht"])
    .describe("Qualität/Verwertbarkeit des Bildes"),
  sichtbare_fassade: z
    .enum(["voll", "teilweise", "kaum"])
    .describe("Wie vollständig ist die Fassade im Bild sichtbar?"),
  hinweise: z
    .string()
    .describe("Kurzer Hinweis, z. B. Bäume/Autos/Winkel/Verschattung"),
});

export type FacadeVision = z.infer<typeof facadeVisionSchema>;

export type FacadeSource = "bild" | "typologie" | "none";

export interface FacadeResult {
  /** "bild" = verlässliche Bild-Schätzung; "typologie" = Bild verworfen; "none" = kein Bild/kein Key. */
  source: FacadeSource;
  /** WWR aus dem Bild in Prozent (nur bei source === "bild"). */
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
  /** Base64-Bild zur Anzeige (ohne API-Key). */
  imageDataUrl: string | null;
}

/**
 * Qualitaets-Gate: Nur verlaessliche Bilder als "bild" akzeptieren.
 * Regel: Konfidenz "hoch" UND sichtbare Fassade "voll".
 */
export function passesQualityGate(v: FacadeVision): boolean {
  return v.konfidenz === "hoch" && v.sichtbare_fassade === "voll";
}
