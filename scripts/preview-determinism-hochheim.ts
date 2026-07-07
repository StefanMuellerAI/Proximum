/**
 * E2E-Determinismus-Test: laedt den ECHTEN Hochheim-Energieausweis 10x
 * hintereinander durch die KI-Extraktion (identischer Code-Pfad wie
 * /api/extract) und vergleicht die Ergebnisse Lauf fuer Lauf.
 *
 * Ziel: herausfinden, WO die Pipeline nichtdeterministisch ist –
 * in der rohen Vision-Extraktion (Feld-Diff der JSON-Antworten) und/oder
 * in den daraus abgeleiteten Engine-Ergebnissen (CO2, CRREM, Taxonomie).
 *
 * Aufruf:
 *   npx vercel env pull .env.e2e.local --environment=preview   # einmalig
 *   npx vitest run --config vitest.preview.config.ts scripts/preview-determinism-hochheim.ts
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractEnergieausweis } from "@/lib/extraction";
import {
  normalizeExtraction,
  type EnergieausweisExtraction,
} from "@/lib/schema";
import { analyzeBase } from "@/lib/engine";

// Umgebung laden (ANTHROPIC_API_KEY liegt nur in Vercel Preview/Production)
for (const file of [".env.e2e.local", ".env.local"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* Datei optional */
  }
}

const PDF = path.join(
  process.cwd(),
  "Testausweise",
  "Hochheim_Energieausweis Gewerbe .pdf",
);

const RUNS = 10;
/** Parallele Calls; klein halten wegen Anthropic-Rate-Limits (PDF = viele Tokens). */
const CONCURRENCY = 2;

/** Flacht ein JSON-Objekt zu "pfad -> Wert" ab (Arrays mit Index). */
function flatten(
  value: unknown,
  prefix = "",
  out: Map<string, string> = new Map(),
): Map<string, string> {
  if (value === null || typeof value !== "object") {
    out.set(prefix || "(root)", JSON.stringify(value));
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) out.set(prefix, "[]");
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) out.set(prefix, "{}");
  for (const k of keys) flatten(obj[k], prefix ? `${prefix}.${k}` : k, out);
  return out;
}

interface RunResult {
  run: number;
  ms: number;
  raw: EnergieausweisExtraction;
  derived: Record<string, string>;
}

/** Kennzahlen, die im Frontend sichtbar sind (Normalisierung + Engine). */
function deriveMetrics(raw: EnergieausweisExtraction): Record<string, string> {
  const b = normalizeExtraction(raw);
  const a = analyzeBase(b);
  const carriers = [...b.perCarrier]
    .sort((x, y) => x.carrier.localeCompare(y.carrier))
    .map(
      (s) =>
        `${s.carrier}(W ${s.heatKwhM2a.toFixed(1)} / S ${s.electricityKwhM2a.toFixed(1)})`,
    )
    .join(", ");
  return {
    "bezugsflaeche_m2": String(b.bezugsflaecheM2),
    "baujahr": String(b.baujahr),
    "crrem_typ": b.crremType,
    "waerme_kwh_m2a": b.heatKwhM2a.toFixed(2),
    "strom_kwh_m2a": b.electricityKwhM2a.toFixed(2),
    "gesamt_kwh_m2a": b.totalKwhM2a.toFixed(2),
    "primaerenergie_kwh_m2a": String(b.primaryKwhM2a),
    "traeger_split": carriers,
    "co2_kg_m2a": a.co2.intensityKgM2a.toFixed(2),
    "co2_t_a": a.co2.tonnesPerYear?.toFixed(2) ?? "–",
    "stranding_jahr": String(a.crrem.strandingYear ?? "kein Stranding"),
    "energiekosten_eur_a": a.cost.eurPerYear?.toFixed(0) ?? "–",
    "co2_abgabe_eur_a": a.levy.eurPerYearBase?.toFixed(0) ?? "–",
    "taxonomie": a.taxonomy.aligned ? "konform" : "nicht konform",
  };
}

async function runOnce(bytes: Uint8Array, run: number): Promise<RunResult> {
  const t0 = Date.now();
  const parsed = await extractEnergieausweis(
    bytes,
    "Hochheim_Energieausweis.pdf",
  );
  const ms = Date.now() - t0;
  if (!parsed.success) {
    throw new Error(
      `Lauf ${run}: Extraktion ungültig: ` +
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
    );
  }
  return { run, ms, raw: parsed.data, derived: deriveMetrics(parsed.data) };
}

/** Gruppiert Werte je Feld: Wert -> Läufe, die ihn geliefert haben. */
function varianceReport(
  label: string,
  perRun: Map<string, string>[],
): string[] {
  const allKeys = new Set<string>();
  for (const m of perRun) for (const k of m.keys()) allKeys.add(k);

  const lines: string[] = [];
  for (const key of [...allKeys].sort()) {
    const groups = new Map<string, number[]>();
    perRun.forEach((m, i) => {
      const v = m.has(key) ? m.get(key)! : "(fehlt)";
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v)!.push(i + 1);
    });
    if (groups.size > 1) {
      lines.push(`  ✗ ${key}`);
      for (const [v, runs] of groups) {
        const shown = v.length > 120 ? v.slice(0, 117) + "…" : v;
        lines.push(`      ${shown}  <- Lauf ${runs.join(", ")}`);
      }
    }
  }
  if (lines.length > 0) lines.unshift(`${label}: ${lines.length} instabile Feld-Gruppen`);
  else lines.push(`${label}: alle Felder über ${perRun.length} Läufe identisch ✓`);
  return lines;
}

describe("E2E-Determinismus: Hochheim-Ausweis 10x extrahieren", () => {
  it(
    "liefert bei identischer Eingabe identische Ergebnisse",
    async () => {
      expect(
        process.env.ANTHROPIC_API_KEY,
        "ANTHROPIC_API_KEY fehlt – bitte `npx vercel env pull .env.e2e.local --environment=preview` ausführen.",
      ).toBeTruthy();

      const bytes = new Uint8Array(readFileSync(PDF));

      // 10 Läufe mit begrenzter Parallelität (Rate-Limits)
      const results: RunResult[] = [];
      let next = 1;
      async function worker() {
        while (next <= RUNS) {
          const run = next++;
          const r = await runOnce(bytes, run);
          console.log(
            `Lauf ${r.run}/${RUNS} fertig (${(r.ms / 1000).toFixed(1)} s): ` +
              `Fläche ${r.derived.bezugsflaeche_m2} m², Wärme ${r.derived.waerme_kwh_m2a}, ` +
              `Strom ${r.derived.strom_kwh_m2a}, CO₂ ${r.derived.co2_kg_m2a} kg/m²a, ` +
              `Stranding ${r.derived.stranding_jahr}`,
          );
          results.push(r);
        }
      }
      await Promise.all(
        Array.from({ length: CONCURRENCY }, () => worker()),
      );
      results.sort((a, b) => a.run - b.run);

      // --- Bericht 1: rohe KI-Extraktion (Feld für Feld) ---
      const rawFlat = results.map((r) => flatten(r.raw));
      const rawReport = varianceReport("ROHE EXTRAKTION (Vision)", rawFlat);

      // --- Bericht 2: abgeleitete Kennzahlen (was der Nutzer sieht) ---
      const derivedFlat = results.map(
        (r) => new Map(Object.entries(r.derived)),
      );
      const derivedReport = varianceReport(
        "ABGELEITETE KENNZAHLEN (Engine)",
        derivedFlat,
      );

      console.log("\n" + "=".repeat(100));
      console.log(`DETERMINISMUS-BERICHT (${RUNS} Läufe, Modell ${process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5"}, temperature 0)`);
      console.log("=".repeat(100));
      for (const l of rawReport) console.log(l);
      console.log("-".repeat(100));
      for (const l of derivedReport) console.log(l);
      console.log("=".repeat(100) + "\n");

      // Referenz-JSON des ersten Laufs fuer die Fehlersuche ausgeben
      console.log(
        "Referenz (Lauf 1):\n" + JSON.stringify(results[0].raw, null, 2),
      );

      // --- Assertions: Nutzer-sichtbare Kennzahlen MUESSEN stabil sein ---
      const first = results[0].derived;
      for (const r of results.slice(1)) {
        expect(r.derived, `Lauf ${r.run} weicht von Lauf 1 ab`).toEqual(first);
      }

      // Und die rohe Extraktion selbst soll ebenfalls stabil sein
      for (const [i, flat] of rawFlat.entries()) {
        if (i === 0) continue;
        expect(
          Object.fromEntries(flat),
          `Rohe Extraktion Lauf ${i + 1} weicht von Lauf 1 ab`,
        ).toEqual(Object.fromEntries(rawFlat[0]));
      }
    },
    1_800_000,
  );
});
