/**
 * Live-E2E-Test der neuen deterministischen WWR/PV-Pipeline gegen PRODUCTION:
 *
 * 1. Erzeugt via Clerk Backend API eine Test-Session (eigener Account).
 * 2. Ruft /api/facade der Production-App 3x OHNE buildingId auf (kein Cache,
 *    volle Pipeline: Geocoding -> Solar API -> Street View -> Vision).
 * 3. Vergleicht die Läufe Feld für Feld (Determinismus) und rechnet die
 *    Wirkung der neuen Werte (WWR/PV) auf die Engine-Prognosen durch
 *    (altes Typologie-Setup vs. neue datenbasierte Werte).
 *
 * Aufruf: npx tsx scripts/e2e-solar-live.ts
 */
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import type { FacadeResult } from "@/lib/facade";
import { pvYieldFromSolar } from "@/lib/solar";
import type { NormalizedBuilding } from "@/lib/schema";
import { analyzeScenario, analyzeBase } from "@/lib/engine";

for (const file of [".env.e2e.local", ".env.local"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* optional */
  }
}

const APP = "https://proximum.vercel.app";
const CLERK = "https://api.clerk.com/v1";
const ADDRESS = process.argv[2] || "Frankfurter Straße 94, 65239 Hochheim";
const RUNS = Number(process.argv[3] || 3);

const secret = process.env.CLERK_SECRET_KEY;
if (!secret) throw new Error("CLERK_SECRET_KEY fehlt");

async function clerk<T>(pathname: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLERK}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok)
    throw new Error(`Clerk ${pathname}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

// --- 1. Session-Token fuer den ersten (Admin-)User erzeugen ---
const users = await clerk<{ id: string; email_addresses: { email_address: string }[] }[]>(
  "/users?limit=1&order_by=created_at",
);
if (users.length === 0) throw new Error("Kein Clerk-User gefunden");
const userId = users[0].id;
console.log(`Session für User ${userId} (${users[0].email_addresses[0]?.email_address ?? "?"})`);

const session = await clerk<{ id: string }>("/sessions", {
  method: "POST",
  body: JSON.stringify({ user_id: userId }),
});

async function freshJwt(): Promise<string> {
  const tok = await clerk<{ jwt: string }>(`/sessions/${session.id}/tokens`, {
    method: "POST",
    body: JSON.stringify({ expires_in_seconds: 300 }),
  });
  return tok.jwt;
}

// --- 2. /api/facade 3x ohne Cache (kein buildingId) aufrufen ---
const results: FacadeResult[] = [];
for (let i = 1; i <= RUNS; i++) {
  const t0 = Date.now();
  const res = await fetch(`${APP}/api/facade`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await freshJwt()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ address: ADDRESS }),
  });
  if (!res.ok)
    throw new Error(`Lauf ${i}: HTTP ${res.status} ${await res.text()}`);
  const d = (await res.json()) as FacadeResult;
  results.push(d);
  console.log(
    `Lauf ${i}/${RUNS} (${((Date.now() - t0) / 1000).toFixed(1)} s): ` +
      `WWR ${d.wwrPercent ?? "–"} % (${d.source}, Konfidenz ${d.konfidenz ?? "–"}) | ` +
      `Solar: ${d.solar?.status ?? "fehlt"}` +
      (d.solar?.status === "ok"
        ? ` – Ertrag ${d.solar.yearlyEnergyDcKwh} kWh/a, Dach ${d.solar.roofAreaM2} m², ` +
          `${d.solar.maxSunshineHoursPerYear} h Sonne, Eignung ${d.solar.eignung}, ` +
          `Befliegung ${d.solar.imageryDate} (${d.solar.imageryQuality})`
        : ` – ${d.solar?.reason ?? ""}`),
  );
}

// --- 3. Determinismus-Vergleich (bildlastige Felder ausklammern) ---
function comparable(r: FacadeResult) {
  const { imageDataUrl, ...rest } = r;
  return { ...rest, imageBytes: imageDataUrl?.length ?? 0 };
}
const ref = JSON.stringify(comparable(results[0]));
let allEqual = true;
for (const [i, r] of results.entries()) {
  const same = JSON.stringify(comparable(r)) === ref;
  if (!same) allEqual = false;
  console.log(`Vergleich Lauf ${i + 1} vs. Lauf 1: ${same ? "identisch ✓" : "ABWEICHUNG ✗"}`);
}
if (!allEqual) {
  for (const [i, r] of results.entries())
    console.log(`Lauf ${i + 1}:`, JSON.stringify(comparable(r), null, 2));
}

// --- 4. Wirkung auf die Prognosen (altes vs. neues Setup) ---
const sql = neon(process.env.DATABASE_URL!);
const rows = (await sql`
  select normalized, selected_measures
  from buildings
  where address like ${"%Frankfurter Straße 94%"}
  order by created_at desc
  limit 1
`) as { normalized: NormalizedBuilding; selected_measures: string[] }[];
if (rows.length === 0) throw new Error("Hochheim-Gebäude nicht in der DB");

const b = rows[0].normalized;
const measures = rows[0].selected_measures ?? [];
const r0 = results[0];
const newWwr = r0.source === "bild" && r0.wwrPercent != null ? r0.wwrPercent : b.wwrPercent;
const newPv = pvYieldFromSolar(r0.solar, b.bezugsflaecheM2);

console.log("\n" + "=".repeat(90));
console.log("WIRKUNG AUF DIE PROGNOSEN (Hochheim, gespeicherte Maßnahmen: " + measures.join(", ") + ")");
console.log("=".repeat(90));
console.log(`WWR:        bisher ${b.wwrPercent} % (${b.wwrSource})  ->  neu ${newWwr} % (${r0.source})`);
console.log(
  `PV-Ertrag:  bisher ${b.pvYieldKwhPerM2} kWh/m²·a (${b.pvSource})  ->  neu ${newPv ?? "–"} kWh/m²·a (solar)`,
);

if (measures.length > 0) {
  const oldScen = analyzeScenario(b, measures);
  const nb: NormalizedBuilding = {
    ...b,
    wwrPercent: newWwr,
    pvYieldKwhPerM2: newPv ?? b.pvYieldKwhPerM2,
  };
  const newScen = analyzeScenario(nb, measures);
  const base = analyzeBase(b);
  const fmt = (v: number | null | undefined, d = 1) =>
    v == null ? "–" : v.toFixed(d);
  console.log("\nSzenario mit gespeicherten Maßnahmen (alt -> neu):");
  console.log(
    `  CO₂-Intensität:  ${fmt(oldScen.result.co2.intensityKgM2a)} -> ${fmt(newScen.result.co2.intensityKgM2a)} kg/m²·a  (Ist: ${fmt(base.co2.intensityKgM2a)})`,
  );
  console.log(
    `  Stranding:       ${oldScen.result.crrem.strandingYear ?? "kein"} -> ${newScen.result.crrem.strandingYear ?? "kein"}  (Ist: ${base.crrem.strandingYear ?? "kein"})`,
  );
  console.log(
    `  Energiekosten:   ${fmt(oldScen.result.cost.eurPerYear, 0)} -> ${fmt(newScen.result.cost.eurPerYear, 0)} €/a`,
  );
  console.log(
    `  Einsparung/Jahr: ${fmt(oldScen.annualSavingsEur, 0)} -> ${fmt(newScen.annualSavingsEur, 0)} €/a`,
  );
  console.log(
    `  Amortisation:    ${fmt(oldScen.paybackYears)} -> ${fmt(newScen.paybackYears)} Jahre`,
  );
}

// --- 5. Session wieder beenden ---
await clerk(`/sessions/${session.id}/revoke`, { method: "POST" });
console.log("\nTest-Session widerrufen.");
