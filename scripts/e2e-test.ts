/**
 * End-to-End-Test aller Energieausweise im Verzeichnis "Testausweise".
 *
 * Fuer jede PDF:
 *   1) POST /api/extract   (Claude-Vision + Schema + Normalisierung)  [echte Route]
 *   2) ESG-Engine          (analyzeBase + Sanierungsszenario)         [lib-Import]
 *   3) POST /api/risk       (Geocoding + UTM + Gefahren-API)          [echte Route]
 *   4) POST /api/facade     (Street View + Vision, WWR)               [echte Route]
 *
 * Voraussetzung: laufender Dev-Server auf http://localhost:3000.
 * Aufruf: npx tsx scripts/e2e-test.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeBase, analyzeScenario } from "@/lib/engine";
import type { NormalizedBuilding } from "@/lib/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIR = join(ROOT, "Testausweise");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const SCENARIO = ["fassade", "fenster", "waermepumpe"];

function fmt(n: number | null | undefined, d = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("de-DE", { maximumFractionDigits: d });
}

async function extract(file: string) {
  const bytes = readFileSync(join(DIR, file));
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: "application/pdf" }), file);
  const res = await fetch(`${BASE}/api/extract`, { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { extraction: unknown; normalized: NormalizedBuilding };
}

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function run() {
  const files = readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();
  console.log(`\n=== E2E-Test: ${files.length} Energieausweise ===\n`);

  let pass = 0;
  const rows: string[] = [];

  for (const file of files) {
    console.log("─".repeat(78));
    console.log(`▶ ${file}`);
    const t0 = Date.now();
    try {
      // 1) Extraktion
      const { normalized: b } = await extract(file);
      console.log(
        `  Extraktion: ${b.gebaeudetyp} · ${b.ausweistyp} · "${b.hauptnutzung ?? "?"}" -> CRREM ${b.crremType}` +
          `${b.crremApproximated ? " (genähert)" : ""}`,
      );
      console.log(
        `  Fläche ${fmt(b.bezugsflaecheM2)} m² · Wärme ${fmt(b.heatKwhM2a, 1)} · Strom ${fmt(b.electricityKwhM2a, 1)} · ` +
          `Primär ${fmt(b.primaryKwhM2a, 1)} · THG-Ausweis ${b.thgKgM2a == null ? "—" : fmt(b.thgKgM2a, 1)} · ` +
          `Träger ${b.heatCarrier} · WWR ${fmt(b.wwrPercent)}% (${b.wwrSource})`,
      );

      // 2) Engine
      const base = analyzeBase(b);
      const scen = analyzeScenario(b, SCENARIO);
      console.log(
        `  Engine: CO₂ ${fmt(base.co2.intensityKgM2a, 1)} kg/m²a (${base.co2.tonnesPerYear == null ? "—" : fmt(base.co2.tonnesPerYear, 1) + " t/a"}) · ` +
          `Stranding ${base.crrem.strandingYear ?? ">2050"} · ` +
          `Kosten ${base.cost.eurPerYear == null ? "—" : fmt(base.cost.eurPerYear) + " €/a"} · ` +
          `CO₂-Abgabe ${base.levy.eurPerYearBase == null ? "—" : fmt(base.levy.eurPerYearBase) + " €/a"} · ` +
          `Taxonomie ${base.taxonomy.aligned ? "konform" : "nicht konform"}`,
      );
      console.log(
        `  Szenario [${SCENARIO.join("+")}]: Stranding ${base.crrem.strandingYear ?? ">2050"} -> ${scen.result.crrem.strandingYear ?? ">2050"} · ` +
          `Einsparung ${scen.annualSavingsEur == null ? "—" : fmt(scen.annualSavingsEur) + " €/a"} · ` +
          `Amortisation ${scen.paybackYears == null ? "—" : fmt(scen.paybackYears, 1) + " J"}`,
      );

      // Sanity-Checks
      const problems: string[] = [];
      if (!(b.heatKwhM2a > 0 || b.electricityKwhM2a > 0))
        problems.push("keine Energiewerte");
      if (!Number.isFinite(base.co2.intensityKgM2a))
        problems.push("CO₂ NaN");
      if (base.crrem.series.length === 0) problems.push("CRREM leer");

      // 3) Risiko
      let riskInfo = "—";
      if (b.adresse) {
        const r = await postJson("/api/risk", { address: b.adresse });
        riskInfo = r.ok
          ? `${r.data.hazards.length} Gefahren @ ${r.data.location.plz} ${r.data.location.ort}`
          : `Fehler ${r.status}: ${r.data.error}`;
        if (!r.ok) problems.push("Risiko-API");
      }
      console.log(`  Risiko: ${riskInfo}`);

      // 4) Fassade
      let facadeInfo = "—";
      if (b.adresse) {
        const f = await postJson("/api/facade", { address: b.adresse });
        facadeInfo = f.ok
          ? `Quelle=${f.data.source}${f.data.wwrPercent != null ? `, WWR ${f.data.wwrPercent}%` : ""}${f.data.reason ? ` (${f.data.reason})` : ""}`
          : `Fehler ${f.status}`;
      }
      console.log(`  Fassade: ${facadeInfo}`);

      if (b.notes.length) console.log(`  Hinweise: ${b.notes.join(" | ")}`);

      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (problems.length === 0) {
        pass++;
        console.log(`  ✅ OK (${secs}s)`);
        rows.push(`✅ ${file}  [${b.gebaeudetyp}/${b.ausweistyp}, ${b.crremType}]`);
      } else {
        console.log(`  ⚠️  PROBLEME: ${problems.join(", ")} (${secs}s)`);
        rows.push(`⚠️  ${file}  -> ${problems.join(", ")}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ FEHLER: ${msg}`);
      rows.push(`❌ ${file}  -> ${msg}`);
    }
  }

  console.log("\n" + "═".repeat(78));
  console.log(`ZUSAMMENFASSUNG: ${pass}/${files.length} ohne Probleme\n`);
  for (const r of rows) console.log("  " + r);
  console.log("");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
