/**
 * E2E-Test der kompletten Proximum-Analyse gegen den ECHTEN Hochheim-
 * Energieausweis (HE-2020-003045029, Bedarfsausweis NWG, "Ärztehaus"):
 *
 *   PDF -> KI-Extraktion (echter Anthropic-Call, identischer Prompt wie
 *   /api/extract) -> normalizeExtraction -> Engine (CO2, CRREM, Taxonomie).
 *
 * Vergleicht die Ergebnisse Feld für Feld mit der Wahrheit aus dem Ausweis
 * und mit dem Predium-Onepager (Testausweise/2026-06-25_..._predium_...pdf).
 *
 * Aufruf:
 *   npx vercel env pull .env.e2e.local --environment=preview   # einmalig
 *   npx vitest run --config vitest.preview.config.ts scripts/preview-e2e-hochheim.ts
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractEnergieausweis } from "@/lib/extraction";
import { normalizeExtraction, type NormalizedBuilding } from "@/lib/schema";
import { analyzeBase, type AnalysisResult } from "@/lib/engine";

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

/** Wahrheit aus dem Ausweis (Seite 1 + Endenergietabelle Seite 2). */
const AUSWEIS = {
  registriernummer: "HE-2020-003045029",
  flaecheM2: 6121,
  baujahr: 2017,
  primaerenergie: 233,
  erdgas: 40.7,
  strom: 80.4,
  gesamt: 121.1,
  gasProzent: 33.6,
  stromProzent: 66.4,
};

/** Werte aus dem Predium-Onepager (25.06.2026) zur Einordnung. */
const PREDIUM = {
  flaecheM2: 5109,
  baujahr: 2018,
  endenergie: 121,
  primaerenergie: 189.5,
  co2Intensitaet2026: 11.6,
  splitText: "66,39 % Grünstrom / 33,61 % Erdgas",
  misalignment: 2037,
  taxonomie: "beste 30 % (auf PE 189,5)",
};

function fmt(v: number | null | undefined, digits = 1): string {
  if (v == null) return "–";
  return v.toFixed(digits).replace(".", ",");
}

function printComparison(b: NormalizedBuilding, a: AnalysisResult) {
  const gas = b.perCarrier.find((s) => s.carrier === "erdgas");
  const strom = b.perCarrier.find((s) => s.carrier === "strom_netz");
  const gasPct = gas ? ((gas.heatKwhM2a + gas.electricityKwhM2a) / b.totalKwhM2a) * 100 : 0;
  const stromPct = strom
    ? ((strom.heatKwhM2a + strom.electricityKwhM2a) / b.totalKwhM2a) * 100
    : 0;

  const rows: [string, string, string, string][] = [
    ["Feld", "Ausweis (Wahrheit)", "Proximum (E2E)", "Predium (Onepager)"],
    ["Bezugsfläche m²", String(AUSWEIS.flaecheM2), fmt(b.bezugsflaecheM2, 0), String(PREDIUM.flaecheM2)],
    ["Baujahr", String(AUSWEIS.baujahr), String(b.baujahr ?? "–"), String(PREDIUM.baujahr)],
    ["Endenergie kWh/m²a", fmt(AUSWEIS.gesamt), fmt(b.totalKwhM2a), String(PREDIUM.endenergie)],
    ["  davon Wärme (Träger)", fmt(AUSWEIS.erdgas), fmt(b.heatKwhM2a), "–"],
    ["  davon Strom (Träger)", fmt(AUSWEIS.strom), fmt(b.electricityKwhM2a), "–"],
    ["Primärenergie kWh/m²a", String(AUSWEIS.primaerenergie), fmt(b.primaryKwhM2a, 0), fmt(PREDIUM.primaerenergie)],
    [
      "Träger-Split",
      `${fmt(AUSWEIS.gasProzent)} % Gas / ${fmt(AUSWEIS.stromProzent)} % Strom`,
      `${fmt(gasPct)} % Gas / ${fmt(stromPct)} % Strom`,
      PREDIUM.splitText,
    ],
    ["Strom-Art", "Strom-Mix (Netz)", strom?.label ?? "–", "Grünstrom (Annahme)"],
    [
      "CO₂ kg/m²a (2026)",
      "– (nicht ausgewiesen)",
      fmt(a.co2.intensityKgM2a),
      fmt(PREDIUM.co2Intensitaet2026),
    ],
    [
      "CRREM Misalignment",
      "–",
      a.crrem.strandingYear != null ? String(a.crrem.strandingYear) : "kein Stranding bis 2050",
      String(PREDIUM.misalignment),
    ],
    [
      "EU-Taxonomie",
      "PE 233 > Schwelle -> nicht konform",
      `${a.taxonomy.aligned ? "konform" : "nicht konform"} (${a.taxonomy.detail})`,
      PREDIUM.taxonomie,
    ],
    ["CRREM-Nutzungsart", "Ärztehaus -> Gesundheit", b.crremType, "Gesundheitseinrichtung"],
  ];

  const widths = [26, 34, 42, 34];
  const line = (r: [string, string, string, string]) =>
    r.map((c, i) => c.padEnd(widths[i])).join("| ");
  console.log("\n" + "=".repeat(140));
  console.log("E2E-VERGLEICH HOCHHEIM (Frankfurter Straße 94)");
  console.log("=".repeat(140));
  for (const [i, r] of rows.entries()) {
    console.log(line(r));
    if (i === 0) console.log("-".repeat(140));
  }
  console.log("=".repeat(140));
  console.log("Hinweise/Flags aus der Normalisierung:");
  for (const n of b.notes) console.log("  • " + n);
  for (const f of b.flags) console.log(`  ⚑ [${f.severity}] ${f.field}: ${f.message}`);
  console.log("");
}

describe("E2E: Hochheim-Energieausweis komplett durch die Pipeline", () => {
  it(
    "extrahiert, normalisiert und analysiert ausweistreu",
    async () => {
      expect(
        process.env.ANTHROPIC_API_KEY,
        "ANTHROPIC_API_KEY fehlt – bitte `npx vercel env pull .env.e2e.local --environment=preview` ausführen.",
      ).toBeTruthy();

      const bytes = new Uint8Array(readFileSync(PDF));
      const parsed = await extractEnergieausweis(bytes, "Hochheim_Energieausweis.pdf");
      if (!parsed.success) {
        throw new Error(
          "Extraktion ungültig: " +
            parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        );
      }

      console.log("\nRohe Extraktion:\n" + JSON.stringify(parsed.data, null, 2));

      const b = normalizeExtraction(parsed.data);
      const base = analyzeBase(b);
      printComparison(b, base);

      // --- Stammdaten (Wahrheit aus dem Ausweis) ---
      expect(parsed.data.registriernummer).toBe(AUSWEIS.registriernummer);
      expect(b.bezugsflaecheM2).toBe(AUSWEIS.flaecheM2);
      expect(b.baujahr).toBe(AUSWEIS.baujahr);
      expect(b.gebaeudetyp).toBe("Nichtwohngebäude");
      expect(b.ausweistyp).toBe("Bedarfsausweis");
      expect(b.crremType).toBe("HEC"); // Ärztehaus -> Gesundheit

      // --- Energie: der eigentliche Bugfix (Träger-Split) ---
      expect(b.primaryKwhM2a).toBe(AUSWEIS.primaerenergie);
      expect(b.heatKwhM2a).toBeCloseTo(AUSWEIS.erdgas, 1);
      expect(b.electricityKwhM2a).toBeCloseTo(AUSWEIS.strom, 1);
      expect(b.totalKwhM2a).toBeCloseTo(AUSWEIS.gesamt, 1);

      const gas = b.perCarrier.find((s) => s.carrier === "erdgas");
      const strom = b.perCarrier.find((s) => s.carrier === "strom_netz");
      expect(gas).toBeDefined();
      expect(strom).toBeDefined();
      const gasPct = ((gas!.heatKwhM2a + gas!.electricityKwhM2a) / b.totalKwhM2a) * 100;
      expect(gasPct).toBeCloseTo(AUSWEIS.gasProzent, 0);
      // Netzmix als Default-Baseline (location-based), KEIN Grünstrom wie Predium
      expect(b.perCarrier.some((s) => s.carrier === "strom_gruen")).toBe(false);

      // --- Engine: CO2 muss aus den Trägern gerechnet werden (Ausweis hat kein THG)
      expect(b.thgKgM2a).toBeNull();
      expect(base.co2.fromCertificate).toBe(false);
      // Netzmix-basiert deutlich über Prediums Grünstrom-Lesart (11,6)
      expect(base.co2.intensityKgM2a).toBeGreaterThan(25);

      // --- Taxonomie: harter Schwellentest auf PE 233 -> nicht konform
      expect(base.taxonomy.aligned).toBe(false);
      expect(base.taxonomy.primaryKwhM2a).toBe(233);
    },
    180_000,
  );
});
