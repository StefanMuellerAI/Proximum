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
  // Bild 1: Strassenansicht (Fassade)
  fensteranteil_prozent: z
    .number()
    .min(0)
    .max(100)
    .describe("Bild 1 (Straßenansicht): Fenster-zu-Wand-Anteil der Fassade in %"),
  konfidenz: z
    .enum(["hoch", "mittel", "gering"])
    .describe("Sicherheit der WWR-Schätzung"),
  bildqualitaet: z
    .enum(["gut", "teilweise verdeckt", "schlecht"])
    .describe("Qualität der Straßenansicht"),
  sichtbare_fassade: z
    .enum(["voll", "teilweise", "kaum"])
    .describe("Wie vollständig ist die Fassade sichtbar?"),
  hinweise: z.string().describe("Kurzer Hinweis zur Fassade (Bäume/Autos/Winkel)"),
  // Bild 2: Luftbild (Dach)
  dach_ausrichtung: z
    .enum(["Süd", "Ost-West", "Nord", "flach/unklar"])
    .optional()
    .describe("Bild 2 (Luftbild): Hauptausrichtung der Dachflächen"),
  pv_eignung: z
    .enum(["hoch", "mittel", "gering"])
    .optional()
    .describe("Eignung des Dachs für Photovoltaik (Fläche, Ausrichtung, Verschattung)"),
  pv_hinweise: z
    .string()
    .optional()
    .describe("Kurzer Hinweis zum Dach/PV (z. B. Gauben, Verschattung, Dachtyp)"),
});

export type FacadeVision = z.infer<typeof facadeVisionSchema>;

export type FacadeSource = "bild" | "typologie" | "none";
export type AerialSource = "3d" | "satellit" | "none";

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
  /** Base64-Fassadenbild (Street View) zur Anzeige (ohne API-Key). */
  imageDataUrl: string | null;

  // Luftbild (Dach) + abgeleitete PV-Infos
  aerialSource: AerialSource;
  aerialImageDataUrl: string | null;
  dachAusrichtung: FacadeVision["dach_ausrichtung"] | null;
  pvEignung: FacadeVision["pv_eignung"] | null;
  pvYieldKwhPerM2: number | null;
  pvHinweise: string | null;
}

/**
 * Qualitaets-Gate: Nur verlaessliche Bilder als "bild" akzeptieren.
 * Regel: Konfidenz "hoch" UND sichtbare Fassade "voll".
 */
export function passesQualityGate(v: FacadeVision): boolean {
  return v.konfidenz === "hoch" && v.sichtbare_fassade === "voll";
}
