/**
 * Report-Konfiguration: welche Abschnitte/Angaben im PDF-Report erscheinen.
 * Wird je Organisation (bzw. je User im persoenlichen Bereich) gespeichert
 * (Tabelle report_settings) und im PrintReport bedingt gerendert.
 */
import { z } from "zod";

export const REPORT_SECTIONS = {
  gebaeudegrafik: "Gebäudegrafik (Deckblatt)",
  zusammenfassung: "Kennzahlen-Zusammenfassung",
  crrem: "CRREM-Pfad & Misalignment",
  co2abgabe: "CO₂-Abgabe-Projektion",
  massnahmen: "Sanierungsmaßnahmen & Wirtschaftlichkeit",
  fassade: "Gebäudehülle, Fassade & Dach (Bilder)",
  taxonomie: "EU-Taxonomie & DNSH",
  klimarisiken: "Klimarisiken am Standort",
  datenstand: "Datenstand der Referenzwerte",
} as const;

export type ReportSectionKey = keyof typeof REPORT_SECTIONS;

export const REPORT_OPTIONS = {
  kostenAnzeigen: "€-Angaben anzeigen (Energiekosten, Investitionen, CO₂-Abgabe)",
  detailTabellen: "Jahres-Detailtabellen unter den Diagrammen",
  perzentilAnzeigen: "Einordnung im nationalen Bestand (beste ~X %)",
  orgNameImKopf: "Organisationsname im Report-Kopf",
} as const;

export type ReportOptionKey = keyof typeof REPORT_OPTIONS;

export interface ReportConfig {
  sections: Record<ReportSectionKey, boolean>;
  options: Record<ReportOptionKey, boolean>;
}

export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  sections: {
    gebaeudegrafik: true,
    zusammenfassung: true,
    crrem: true,
    co2abgabe: true,
    massnahmen: true,
    fassade: true,
    taxonomie: true,
    klimarisiken: true,
    datenstand: true,
  },
  options: {
    kostenAnzeigen: true,
    detailTabellen: true,
    perzentilAnzeigen: true,
    orgNameImKopf: true,
  },
};

/** Zod-Schema fuer die API-Validierung (unbekannte Keys werden verworfen). */
export const reportConfigSchema = z.object({
  sections: z.object(
    Object.fromEntries(
      Object.keys(REPORT_SECTIONS).map((k) => [k, z.boolean()]),
    ) as Record<ReportSectionKey, z.ZodBoolean>,
  ),
  options: z.object(
    Object.fromEntries(
      Object.keys(REPORT_OPTIONS).map((k) => [k, z.boolean()]),
    ) as Record<ReportOptionKey, z.ZodBoolean>,
  ),
});

/**
 * Merged eine (evtl. unvollstaendige/aeltere) gespeicherte Config mit den
 * Defaults – neue Sections/Optionen sind damit automatisch aktiviert.
 */
export function mergeReportConfig(stored: unknown): ReportConfig {
  const s = (stored ?? {}) as Partial<ReportConfig>;
  const sections = { ...DEFAULT_REPORT_CONFIG.sections };
  const options = { ...DEFAULT_REPORT_CONFIG.options };
  if (s.sections && typeof s.sections === "object") {
    for (const key of Object.keys(sections) as ReportSectionKey[]) {
      const v = (s.sections as Record<string, unknown>)[key];
      if (typeof v === "boolean") sections[key] = v;
    }
  }
  if (s.options && typeof s.options === "object") {
    for (const key of Object.keys(options) as ReportOptionKey[]) {
      const v = (s.options as Record<string, unknown>)[key];
      if (typeof v === "boolean") options[key] = v;
    }
  }
  return { sections, options };
}
