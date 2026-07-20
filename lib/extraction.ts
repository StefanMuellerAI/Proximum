/**
 * KI-Extraktion deutscher Energieausweise (PDF -> EnergieausweisExtraction).
 *
 * Gemeinsames Modul fuer die API-Route (app/api/extract) und E2E-Tests
 * (scripts/preview-e2e-*.ts), damit Tests exakt denselben Prompt und
 * dieselbe Validierung durchlaufen wie die Produktion.
 */
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { energieausweisSchema } from "@/lib/schema";

// JSON-Vorlage im Prompt statt grammatik-erzwungenem Tool-Schema.
// Grund: Anthropics constrained decoding lehnt komplexe Schemas ab
// ("Schema is too complex"). generateText + Zod-Validierung ist robuster.
export const JSON_TEMPLATE = `{
  "registriernummer": string,
  "gueltig_bis": string,
  "ausstellungsdatum": string,
  "geg_stand": string,
  "anlass_ausstellung": string,
  "gebaeudetyp": "Wohngebäude" | "Nichtwohngebäude",         // PFLICHT
  "ausweistyp": "Bedarfsausweis" | "Verbrauchsausweis",       // PFLICHT
  "hauptnutzung_gebaeudekategorie": string,
  "adresse": string,                                          // Straße, PLZ, Ort
  "baujahr_gebaeude": number,
  "energietraeger_heizung": string[],                          // PFLICHT, z. B. ["Erdgas"]
  "flaechenart": string,
  "nettogrundflaeche_m2": number,                              // NWG
  "gebaeudenutzflaeche_an_m2": number,                         // WG (A_N)
  "wohnflaeche_m2": number,
  "energieeffizienzklasse": string,                            // A+..H (nur WG)
  "primaerenergie_kwh_m2a": number,
  "endenergie_gesamt_kwh_m2a": number,
  "endenergie_waerme_kwh_m2a": number,                         // NWG: Wärmeträger-Zeile(n) der Endenergie-Tabelle S. 2
  "endenergie_strom_kwh_m2a": number,                          // NWG: Strom-Zeile der Endenergie-Tabelle S. 2
  "endenergie_wg_einzelwert_kwh_m2a": number,                  // WG-Einzelwert
  "treibhausgasemissionen_kg_co2e_m2a": number,                // nur wenn angegeben
  "endenergie_je_traeger": [
    { "energietraeger": string, "waerme_kwh_m2a": number, "strom_kwh_m2a": number }
  ],
  "modernisierungsempfehlungen": [
    { "bauteil_anlagenteil": string, "empfohlene_massnahme": string }
  ],
  "konfidenz_kernfelder": {                                     // Selbsteinschätzung je Kernfeld
    "flaeche": "hoch" | "mittel" | "gering",
    "endenergie": "hoch" | "mittel" | "gering",
    "primaerenergie": "hoch" | "mittel" | "gering",
    "energietraeger": "hoch" | "mittel" | "gering",
    "baujahr": "hoch" | "mittel" | "gering"
  }
}`;

export const SYSTEM_PROMPT = `Du bist ein Experte für deutsche Energieausweise (GEG 2024 und ältere EnEV, BBSR-Muster).
Extrahiere die Kennwerte aus dem PDF und antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt
gemäß der vorgegebenen Struktur – kein Markdown, keine Code-Fences, keine Erklärungen.

Regeln:
- Unterscheide Wohngebäude (WG) und Nichtwohngebäude (NWG) sowie Bedarfs- und Verbrauchsausweis.
- Bei NWG: Endenergie Wärme UND Strom getrennt (kWh/(m²·a)).
- Bei WG: nutze den Einzelwert der Endenergie.
- Zahlen als JSON-Zahlen (deutsches Dezimalkomma als Punkt), NICHT nachrechnen.
- Felder, deren Wert NICHT im Dokument steht, WEGLASSEN (nicht raten, nicht null schreiben).
- gebaeudetyp, ausweistyp und energietraeger_heizung sind IMMER anzugeben.
- energietraeger_heizung steht auf Seite 1 unter „Wesentliche Energieträger für Heizung";
  übernimm die dortige Bezeichnung wörtlich (z. B. "Erdgas", "Fernwärme", "Heizöl EL").
- WICHTIG (NWG): endenergie_waerme_kwh_m2a und endenergie_strom_kwh_m2a stammen
  AUSSCHLIESSLICH aus der Endenergiebedarf/-verbrauch-Tabelle auf Seite 2:
  "Wärme" = Wert der Wärmeträger-Zeile(n) (Erdgas, Heizöl, Fernwärme, …),
  "Strom" = Wert der Zeile mit Energieträger Strom/Strommix. Die Reihenfolge der
  „Wesentlichen Energieträger" auf Seite 1 sagt NICHTS über die Höhe der Werte aus –
  ordne die Zahlen NIEMALS nach dieser Reihenfolge zu.
- endenergie_je_traeger: übernimm JEDE Zeile der Endenergie-Tabelle exakt
  (Energieträger-Bezeichnung wörtlich, Wert "Gebäude insgesamt" der Zeile).
- Antworte reproduzierbar: gleiche Eingabe -> gleiche Werte, keine Umformulierungen.
- Aushang-/Kurzformate enthalten nur wenige Felder – das ist zulässig.
- konfidenz_kernfelder: Gib IMMER eine ehrliche Selbsteinschätzung je Kernfeld an
  ("hoch" = klar lesbar und eindeutig, "mittel" = lesbar aber mehrdeutig/unscharf,
  "gering" = schlecht lesbar oder unsicher zugeordnet). Nur für Felder, die du
  tatsächlich befüllt hast; ausgelassene Felder auch hier weglassen.`;

/** Extrahiert das erste JSON-Objekt aus einer Modellantwort (tolerant ggü. Fences/Text). */
export function parseJsonLoose(text: string): unknown {
  let raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) raw = fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start)
    throw new Error("Keine JSON-Struktur in der Antwort gefunden.");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Fuehrt die KI-Extraktion aus und validiert das Ergebnis gegen das
 * Zod-Schema. Wirft bei Netz-/Parsingfehlern; Validierungsfehler werden
 * als safeParse-Ergebnis zurueckgegeben.
 */
export async function extractEnergieausweis(bytes: Uint8Array, filename?: string) {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  const { text } = await generateText({
    model: anthropic(model),
    system: SYSTEM_PROMPT,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extrahiere die Kennwerte dieses Energieausweises exakt nach folgender JSON-Struktur (weglassen, was fehlt):\n\n${JSON_TEMPLATE}`,
          },
          {
            type: "file",
            data: bytes,
            mediaType: "application/pdf",
            filename: filename || "energieausweis.pdf",
          },
        ],
      },
    ],
  });

  return energieausweisSchema.safeParse(parseJsonLoose(text));
}

// ---------------------------------------------------------------------------
// Rechnungs-Import (GAP-7): Energie-/Waermerechnungen -> Verbrauchsdaten.
// Wiederverwendet die Vision-Pipeline (PLUS-1) statt Template-OCR.
// ---------------------------------------------------------------------------

const rechnungPositionSchema = z.object({
  energietraeger: z.string().describe("Energieträger, z. B. Erdgas, Strom, Fernwärme"),
  zeitraum_von: z.string().describe("Lieferzeitraum-Beginn (ISO-Datum)"),
  zeitraum_bis: z.string().describe("Lieferzeitraum-Ende (ISO-Datum)"),
  menge_kwh: z.number().describe("Gelieferte Menge in kWh (negativ bei Gutschrift/Storno)"),
  kosten_eur: z.number().optional().describe("Kosten brutto in EUR (negativ bei Gutschrift)"),
});

export const energieRechnungSchema = z.object({
  lieferant: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  ist_storno_oder_gutschrift: z.boolean().optional(),
  positionen: z.array(rechnungPositionSchema).default([]),
  konfidenz: z.enum(["hoch", "mittel", "gering"]).optional(),
});

export type EnergieRechnungExtraction = z.infer<typeof energieRechnungSchema>;

const RECHNUNG_TEMPLATE = `{
  "lieferant": string,
  "rechnungsnummer": string,
  "ist_storno_oder_gutschrift": boolean,
  "positionen": [
    { "energietraeger": string, "zeitraum_von": "YYYY-MM-DD", "zeitraum_bis": "YYYY-MM-DD", "menge_kwh": number, "kosten_eur": number }
  ],
  "konfidenz": "hoch" | "mittel" | "gering"
}`;

const RECHNUNG_SYSTEM_PROMPT = `Du bist ein Experte für deutsche Energie-, Gas-, Strom-, Fernwärme- und Heizkostenabrechnungen.
Extrahiere die Verbrauchspositionen aus dem PDF und antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt
gemäß der vorgegebenen Struktur – kein Markdown, keine Erklärungen.

Regeln:
- Je Energieträger und Lieferzeitraum EINE Position (kWh; m³ Gas in kWh umrechnen NUR wenn der Umrechnungsfaktor auf der Rechnung steht, sonst weglassen).
- Storno-/Gutschriftbeträge als NEGATIVE Mengen/Kosten übernehmen und ist_storno_oder_gutschrift = true setzen.
- Daten als ISO-Format (YYYY-MM-DD).
- Felder ohne Wert weglassen; nichts raten.
- konfidenz: ehrliche Gesamteinschätzung der Lesbarkeit/Eindeutigkeit.`;

/** KI-Extraktion einer Energierechnung (PDF -> Verbrauchspositionen). */
export async function extractEnergieRechnung(bytes: Uint8Array, filename?: string) {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  const { text } = await generateText({
    model: anthropic(model),
    system: RECHNUNG_SYSTEM_PROMPT,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extrahiere die Verbrauchspositionen dieser Energierechnung exakt nach folgender JSON-Struktur:\n\n${RECHNUNG_TEMPLATE}`,
          },
          {
            type: "file",
            data: bytes,
            mediaType: "application/pdf",
            filename: filename || "rechnung.pdf",
          },
        ],
      },
    ],
  });

  return energieRechnungSchema.safeParse(parseJsonLoose(text));
}
