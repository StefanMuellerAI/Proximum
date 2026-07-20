/**
 * Assumption-Sets (Spez. 2.13-4): Annahme-Pakete als versionierte Einheit.
 *
 * Ein Report/Szenario referenziert ein EINGEFRORENES Set; die Aktualisierung
 * auf neue Referenzdaten ist eine bewusste Nutzeraktion. Ohne dieses Konzept
 * werden abgeschlossene Reports durch Datenpflege rueckwirkend falsch.
 *
 * Die Engine bleibt pure: analyze() erhaelt das aufgeloeste Set als
 * Parameter; ohne Angabe gilt das DEFAULT-Set aus den aktuellen
 * Referenzdaten (lib/data/reference.ts).
 */
import {
  CARRIERS,
  REFERENCE_INFO,
  type CarrierKey,
  type Co2PricePath,
} from "@/lib/data/reference";
import { CRREM_VERSION } from "@/lib/engine/crrem";

/** Emissionsfaktor-Datenbank fuer CO2e-Intensitaeten (Spez. 2.5). */
export type EfDatabase = "crrem" | "geg";

export interface AssumptionSet {
  /** Menschlich lesbare Kennung, z. B. "Default 2025-06". */
  name: string;
  /** Versionsstempel der zugrunde liegenden Referenzdaten. */
  referenceVersion: string;
  crremVersion: string;
  efDatabase: EfDatabase;
  co2PricePath: Co2PricePath;
  /** Energiepreise EUR/kWh je Traeger + Basisjahr der Preistabelle. */
  energyPrices: Record<CarrierKey, number>;
  energyPriceBaseYear: number;
  /** Baupreisindex-Stand der Kostenschaetzung (Destatis 61261-0001). */
  bpiStand: string;
  /** Regionalfaktor der Kostenschaetzung (Default 1,0). */
  regionalFactor: number;
}

function currentPrices(): Record<CarrierKey, number> {
  const prices = {} as Record<CarrierKey, number>;
  for (const key of Object.keys(CARRIERS) as CarrierKey[])
    prices[key] = CARRIERS[key].priceEurPerKwh;
  return prices;
}

/** Default-Set aus den aktuellen Referenzdaten (nicht eingefroren). */
export function defaultAssumptionSet(): AssumptionSet {
  return {
    name: `Default ${REFERENCE_INFO.version}`,
    referenceVersion: REFERENCE_INFO.version,
    crremVersion: CRREM_VERSION,
    efDatabase: "geg",
    co2PricePath: "behg",
    energyPrices: currentPrices(),
    energyPriceBaseYear: 2024,
    bpiStand: "2024-Q4",
    regionalFactor: 1.0,
  };
}

/**
 * Stabile Serialisierung fuer Snapshot-Hashes (Abnahme 4.9): Schluessel
 * sortiert, keine Whitespace-Varianz.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}
