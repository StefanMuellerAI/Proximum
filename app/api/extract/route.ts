import { NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { energieausweisSchema, normalizeExtraction } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const MAX_BYTES = 20 * 1024 * 1024;

// JSON-Vorlage im Prompt statt grammatik-erzwungenem Tool-Schema.
// Grund: Anthropics constrained decoding lehnt komplexe Schemas ab
// ("Schema is too complex"). generateText + Zod-Validierung ist robuster.
const JSON_TEMPLATE = `{
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
  "endenergie_waerme_kwh_m2a": number,                         // NWG
  "endenergie_strom_kwh_m2a": number,                          // NWG
  "endenergie_wg_einzelwert_kwh_m2a": number,                  // WG-Einzelwert
  "treibhausgasemissionen_kg_co2e_m2a": number,                // nur wenn angegeben
  "endenergie_je_traeger": [
    { "energietraeger": string, "waerme_kwh_m2a": number, "strom_kwh_m2a": number }
  ],
  "modernisierungsempfehlungen": [
    { "bauteil_anlagenteil": string, "empfohlene_massnahme": string }
  ]
}`;

const SYSTEM_PROMPT = `Du bist ein Experte für deutsche Energieausweise (GEG 2024 und ältere EnEV, BBSR-Muster).
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
- Antworte reproduzierbar: gleiche Eingabe -> gleiche Werte, keine Umformulierungen.
- Aushang-/Kurzformate enthalten nur wenige Felder – das ist zulässig.`;

/** Extrahiert das erste JSON-Objekt aus einer Modellantwort (tolerant ggü. Fences/Text). */
function parseJsonLoose(text: string): unknown {
  let raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) raw = fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start)
    throw new Error("Keine JSON-Struktur in der Antwort gefunden.");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY ist nicht gesetzt. Bitte in der Umgebung (.env.local) hinterlegen.",
      },
      { status: 500 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Request (multipart/form-data mit Feld 'file' erwartet)." },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json(
      { error: "Keine Datei hochgeladen (Feld 'file')." },
      { status: 400 },
    );
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Nur PDF-Dateien werden unterstützt." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Datei zu groß (max. 20 MB)." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const { text } = await generateText({
      model: anthropic(MODEL),
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
              filename: file.name || "energieausweis.pdf",
            },
          ],
        },
      ],
    });

    const parsed = energieausweisSchema.safeParse(parseJsonLoose(text));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: `Extrahierte Daten unvollständig/ungültig: ${parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .slice(0, 5)
            .join("; ")}`,
        },
        { status: 422 },
      );
    }

    const normalized = normalizeExtraction(parsed.data);
    return NextResponse.json({ extraction: parsed.data, normalized });
  } catch (err) {
    console.error("Extraction failed:", err);
    const message =
      err instanceof Error ? err.message : "Unbekannter Fehler bei der Extraktion.";
    return NextResponse.json(
      { error: `Extraktion fehlgeschlagen: ${message}` },
      { status: 502 },
    );
  }
}
