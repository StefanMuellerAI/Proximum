/**
 * Kostenschaetzung der Massnahmen (GAP-5, Spez. 2.9):
 *
 *   Investitionskosten = Einheitskosten x Menge x BPI x Regionalfaktor
 *                        x Baunebenkosten(1,15) x MwSt(1,19)
 *
 * Mengenlogik:
 *   Huelle   -> Bauteilflaeche [m2] (aus dem thermischen Modell, GAP-2!)
 *   Heizung  -> Heizleistung [kW] (Heizlast-Kennwerte, 2.13-9)
 *   LED      -> installierte Lumen / 1.650
 *   Lueftung -> Geraeteanzahl (zentral 1; dezentral: EFH 1, MFH je WE,
 *               NWG Nutzflaeche/100)
 *   PV       -> kWp aus 80 % Dachflaeche x Wp/m2
 *
 * Sonderformeln (Predium-identisch):
 *   Fernwaerme (IWU):            EK x Flaeche x Flaeche^(-0,487) x Faktoren
 *   Hydr. Abgleich ohne Ventile: 10,41 x EBF^(-0,1998) [EUR/m2 EBF]
 *   Hydr. Abgleich mit Ventilen: 14,12 x EBF^(-0,1412) [EUR/m2 EBF]
 *
 * Ergebnisse sind SCHAETZWERTE (Kennzeichnung isEstimate); manuelle
 * Overrides passieren an der Massnahme (measures.costOverrideEur).
 */
import {
  COST_FUNCTIONS,
  BPI_INDEX,
  bpiFactor,
  heatLoadKw,
  type CostFunctionDef,
} from "@/lib/data/cost-functions";
import type { ThermalModel } from "@/lib/engine/thermal/model";

export const VAT_FACTOR = 1.19;
export const ANCILLARY_FACTOR = 1.15; // Baunebenkosten
export const DEFAULT_REGIONAL_FACTOR = 1.0;
/** Aktueller BPI-Stand der Schaetzung (Assumption-Set, 2.13-4). */
export const CURRENT_BPI_LEVEL = "2024-Q4";

/** Modulleistung mono (Wp/m2, DIN 18599-9) fuer die PV-Mengenableitung. */
const PV_WP_PER_M2 = 154;
/** Beleuchtungsniveau-Naeherung (Lumen je m2) fuer die LED-Menge. */
const LUMEN_PER_M2 = 500;

export interface CostContext {
  /** Energiebezugsflaeche (m2). */
  ebfM2: number;
  gebaeudetyp: "Wohngebäude" | "Nichtwohngebäude";
  epcClass: string | null;
  /** Kalibriertes thermisches Modell fuer Bauteilflaechen (GAP-2). */
  thermalModel?: ThermalModel | null;
  /** Wohneinheiten (MFH, fuer dezentrale Lueftung); Default EBF/70. */
  units?: number;
  /** Geschosse (Dachflaechen-Naeherung); Default 3. */
  storeys?: number;
  regionalFactor?: number;
  /** Ziel-BPI-Stand (Default CURRENT_BPI_LEVEL). */
  bpiLevel?: string;
}

export interface CostEstimate {
  measureId: string;
  quantity: number;
  unit: string;
  /** Einheitskosten nach BPI-Indexierung (netto). */
  unitCostEur: number;
  netEur: number;
  /** Brutto inkl. Regionalfaktor, Baunebenkosten und MwSt. */
  grossEur: number;
  isEstimate: true;
  source: string;
  bpiFactorApplied: number;
}

function componentArea(
  ctx: CostContext,
  type: "wand" | "dach" | "kellerdecke" | "fenster",
): number {
  const fromModel = ctx.thermalModel?.components.find((c) => c.type === type);
  if (fromModel) return fromModel.areaM2;
  // Fallback-Geometrie ohne Modell (gleiche Heuristik wie buildThermalModel)
  const storeys = ctx.storeys ?? 3;
  const footprint = ctx.ebfM2 / storeys;
  const facade = 4 * Math.sqrt(Math.max(footprint, 1)) * storeys * 2.5;
  switch (type) {
    case "wand":
      return facade * 0.75;
    case "fenster":
      return facade * 0.25;
    case "dach":
    case "kellerdecke":
      return footprint;
  }
}

function quantityFor(def: CostFunctionDef, ctx: CostContext): number {
  switch (def.measureId) {
    case "fassade":
      return componentArea(ctx, "wand");
    case "dach":
      return componentArea(ctx, "dach");
    case "keller":
      return componentArea(ctx, "kellerdecke");
    case "fenster":
      return componentArea(ctx, "fenster");
    case "abgleich":
    case "fernwaerme":
      return ctx.ebfM2;
    case "lueftung": {
      // dezentral: EFH 1, MFH je WE, NWG Nutzflaeche/100
      if (ctx.gebaeudetyp === "Nichtwohngebäude")
        return Math.max(1, Math.ceil(ctx.ebfM2 / 100));
      const units = ctx.units ?? Math.max(1, Math.round(ctx.ebfM2 / 70));
      return units;
    }
    case "led":
      return (ctx.ebfM2 * LUMEN_PER_M2) / 1650; // installierte Lumen / 1.650
    case "waermepumpe":
      return heatLoadKw(ctx.epcClass, ctx.ebfM2);
    case "pv": {
      const storeys = ctx.storeys ?? 3;
      const roofM2 =
        ctx.thermalModel?.components.find((c) => c.type === "dach")?.areaM2 ??
        ctx.ebfM2 / storeys;
      return (roofM2 * 0.8 * PV_WP_PER_M2) / 1000; // kWp
    }
    default:
      return ctx.ebfM2;
  }
}

/** Einheitskosten (netto, EUR je Funktions-Einheit) VOR Indexierung. */
function unitCost(def: CostFunctionDef, ctx: CostContext): number {
  switch (def.kind) {
    case "linear":
      return (def.fix ?? 0) + (def.slope ?? 0) * (def.defaultParam ?? 0);
    case "pauschal":
      return def.perUnit ?? 0;
    case "degressiv": {
      // EUR/Einheit = a x Menge^b (Groessendegression auf die Menge)
      const qty = quantityFor(def, ctx);
      return (def.a ?? 0) * Math.max(qty, 1) ** (def.b ?? 0);
    }
  }
}

/** Hydraulischer Abgleich OHNE Ventiltausch: 10,41 x EBF^-0,1998 EUR/m2. */
export function hydraulicBalanceWithoutValvesEurPerM2(ebfM2: number): number {
  return 10.41 * Math.max(ebfM2, 1) ** -0.1998;
}

/** Hydraulischer Abgleich MIT Ventiltausch: 14,12 x EBF^-0,1412 EUR/m2. */
export function hydraulicBalanceWithValvesEurPerM2(ebfM2: number): number {
  return 14.12 * Math.max(ebfM2, 1) ** -0.1412;
}

/**
 * Schaetzt die Investitionskosten einer Massnahme (netto + brutto).
 * null = keine Kostenfunktion fuer die Massnahme hinterlegt.
 */
export function estimateMeasureCost(
  measureId: string,
  ctx: CostContext,
): CostEstimate | null {
  const def = COST_FUNCTIONS.find((d) => d.measureId === measureId);
  if (!def || ctx.ebfM2 <= 0) return null;

  const quantity = quantityFor(def, ctx);
  const bpi = bpiFactor(def.priceLevel, ctx.bpiLevel ?? CURRENT_BPI_LEVEL);
  const unitCostIndexed = unitCost(def, ctx) * bpi;
  const regional = ctx.regionalFactor ?? DEFAULT_REGIONAL_FACTOR;

  const netEur = unitCostIndexed * quantity * regional;
  const grossEur = netEur * ANCILLARY_FACTOR * VAT_FACTOR;

  return {
    measureId,
    quantity,
    unit: def.unit,
    unitCostEur: unitCostIndexed,
    netEur,
    grossEur,
    isEstimate: true,
    source: `${def.source} · BPI ${def.priceLevel} → ${ctx.bpiLevel ?? CURRENT_BPI_LEVEL} (${BPI_INDEX[def.priceLevel] ?? "?"} → ${BPI_INDEX[ctx.bpiLevel ?? CURRENT_BPI_LEVEL] ?? "?"}, ${bpiFactor(def.priceLevel, ctx.bpiLevel ?? CURRENT_BPI_LEVEL).toFixed(2)}x)`,
    bpiFactorApplied: bpi,
  };
}

/** Schaetzt ein ganzes Massnahmenpaket (Summe brutto/netto). */
export function estimatePackageCost(
  measureIds: string[],
  ctx: CostContext,
): { estimates: CostEstimate[]; totalNetEur: number; totalGrossEur: number } {
  const estimates = measureIds
    .map((id) => estimateMeasureCost(id, ctx))
    .filter((e): e is CostEstimate => e !== null);
  return {
    estimates,
    totalNetEur: estimates.reduce((s, e) => s + e.netEur, 0),
    totalGrossEur: estimates.reduce((s, e) => s + e.grossEur, 0),
  };
}
