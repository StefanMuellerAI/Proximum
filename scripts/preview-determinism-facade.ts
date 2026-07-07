/**
 * E2E-Determinismus-Test der Fassaden-Vision (WWR aus Street View):
 *
 * Holt das ECHTE Street-View-Bild des Hochheim-Gebaeudes aus dem DB-Cache
 * (buildings.facade_result, exakt die Bytes der Produktion) und schickt es
 * 10x mit identischem Prompt/Schema/temperature 0 durch das Vision-Modell –
 * wie /api/facade (Street-View-only-Pipeline; PV kommt seit der Solar-API-
 * Umstellung nicht mehr aus der Vision).
 *
 * Aufruf:
 *   npx vitest run --config vitest.preview.config.ts scripts/preview-determinism-facade.ts
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { neon } from "@neondatabase/serverless";
import {
  facadeVisionSchema,
  passesQualityGate,
  roundWwrToStep,
  type FacadeVision,
} from "@/lib/facade";

for (const file of [".env.e2e.local", ".env.local"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* Datei optional */
  }
}

const ADDRESS_LIKE = "%Frankfurter Straße 94%";
const RUNS = 10;
const CONCURRENCY = 2;

// Identisch zu app/api/facade/route.ts (dort nicht exportiert)
const MODEL = process.env.FACADE_MODEL || "claude-haiku-4-5";
const SYSTEM_PROMPT = `Du bist Experte für Gebäude und erhältst EIN Bild: die Straßenansicht (Fassade frontal).

Aufgabe: Schätze den FENSTER-ZU-WAND-ANTEIL (WWR, %) der sichtbaren Fassade und
beurteile Konfidenz, Bildqualität und Sichtbarkeit der Fassade.

Türen zählen nicht als Fenster. Bewerte ehrlich; bei Verdeckung Konfidenz senken.
Antworte reproduzierbar: gleiches Bild -> gleiche Werte.`;

function dataUrlToBytes(d: string | null): Uint8Array | null {
  if (!d) return null;
  const m = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(d);
  if (!m) return null;
  try {
    return new Uint8Array(Buffer.from(m[1], "base64"));
  } catch {
    return null;
  }
}

interface VisionRun {
  run: number;
  ms: number;
  vision: FacadeVision;
  /** Was in der App tatsaechlich ankommt. */
  effective: Record<string, string>;
}

function effectiveResult(v: FacadeVision): Record<string, string> {
  const wwrOk = passesQualityGate(v);
  return {
    wwr_percent_angewendet: wwrOk
      ? String(roundWwrToStep(v.fensteranteil_prozent))
      : "(verworfen -> Typologie-Default)",
    wwr_roh: String(v.fensteranteil_prozent),
    konfidenz: v.konfidenz,
    bildqualitaet: v.bildqualitaet,
    sichtbare_fassade: v.sichtbare_fassade,
  };
}

function varianceReport(
  label: string,
  perRun: Record<string, string>[],
): string[] {
  const keys = new Set<string>();
  for (const r of perRun) for (const k of Object.keys(r)) keys.add(k);
  const lines: string[] = [];
  for (const key of [...keys].sort()) {
    const groups = new Map<string, number[]>();
    perRun.forEach((r, i) => {
      const v = r[key] ?? "(fehlt)";
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v)!.push(i + 1);
    });
    if (groups.size > 1) {
      lines.push(`  ✗ ${key}`);
      for (const [v, runs] of groups)
        lines.push(`      ${v}  <- Lauf ${runs.join(", ")}`);
    }
  }
  if (lines.length > 0)
    lines.unshift(`${label}: ${lines.length} instabile Feld-Gruppen`);
  else lines.push(`${label}: alle Felder über ${perRun.length} Läufe identisch ✓`);
  return lines;
}

describe("E2E-Determinismus: Fassaden-Vision (WWR) 10x mit identischem Bild", () => {
  it(
    "liefert bei identischem Bild identische WWR-Werte",
    async () => {
      expect(process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY fehlt").toBeTruthy();
      expect(process.env.DATABASE_URL, "DATABASE_URL fehlt").toBeTruthy();

      // --- Echtes Produktions-Bild aus dem DB-Cache holen ---
      const sql = neon(process.env.DATABASE_URL!);
      const rows = (await sql`
        select facade_result->>'imageDataUrl' as street,
               facade_result->>'panoId' as pano_id,
               facade_result->>'panoDate' as pano_date
        from buildings
        where address like ${ADDRESS_LIKE} and facade_result is not null
        order by created_at desc
        limit 1
      `) as { street: string | null; pano_id: string | null; pano_date: string | null }[];
      expect(rows.length, "Kein Gebäude mit Fassaden-Cache in der DB").toBe(1);

      const streetBytes = dataUrlToBytes(rows[0].street);
      console.log(
        `Bild aus DB-Cache: Street ${streetBytes ? streetBytes.length + " B" : "–"} ` +
          `(pano ${rows[0].pano_id}, ${rows[0].pano_date})`,
      );
      expect(streetBytes, "Kein Street-View-Bild im Cache").toBeTruthy();

      // --- 10 Vision-Läufe mit identischen Bytes ---
      const results: VisionRun[] = [];
      let next = 1;
      async function worker() {
        while (next <= RUNS) {
          const run = next++;
          const t0 = Date.now();
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
                  {
                    type: "text",
                    text: "Analysiere die Fassade und fülle das Schema.",
                  },
                  { type: "file", data: streetBytes!, mediaType: "image/jpeg" },
                ],
              },
            ],
          });
          const r: VisionRun = {
            run,
            ms: Date.now() - t0,
            vision: object,
            effective: effectiveResult(object),
          };
          console.log(
            `Lauf ${r.run}/${RUNS} (${(r.ms / 1000).toFixed(1)} s): WWR roh ${r.effective.wwr_roh} % ` +
              `-> angewendet ${r.effective.wwr_percent_angewendet}, Konfidenz ${r.effective.konfidenz}`,
          );
          results.push(r);
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      results.sort((a, b) => a.run - b.run);

      const report = varianceReport(
        `FASSADEN-VISION (${MODEL})`,
        results.map((r) => r.effective),
      );
      console.log("\n" + "=".repeat(100));
      console.log(
        `DETERMINISMUS-BERICHT FASSADE (${RUNS} Läufe, identisches Bild, temperature 0)`,
      );
      console.log("=".repeat(100));
      for (const l of report) console.log(l);
      console.log("=".repeat(100));

      // Assertion: die in der App wirksamen Werte muessen stabil sein
      const first = results[0].effective;
      for (const r of results.slice(1)) {
        expect(r.effective, `Lauf ${r.run} weicht von Lauf 1 ab`).toEqual(first);
      }
    },
    1_800_000,
  );
});
