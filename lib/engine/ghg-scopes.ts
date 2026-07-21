/**
 * Scope-1/2/3-Rechenwerk (GAP-12, Spez. 2.11) nach GHG-Protokoll/PCAF.
 *
 * Drei umschaltbare Perspektiven:
 *  (a) vermieter: operative Kontrolle beim Vermieter - S1/S2 =
 *      Allgemeinflaechen-Anteil, S3 = Mietflaechen ("Downstream Leased
 *      Assets", PCAF Cat. 13)
 *  (b) mieter: spiegelbildlich
 *  (c) whole_building: S1+S2 = ganzes Gebaeude, S3 = 0
 *
 * Allokation nach Flaechenanteilen, OHNE Wetter-/Auslastungsnormalisierung,
 * unabhaengig von CRREM (GEG-Faktorwelt fuer die Intensitaet).
 *
 * Scope 1 = direkte Emissionen (Verbrennung im Gebaeude: Gas, Oel, ...),
 * Scope 2 = eingekaufte Energie (Strom, Fernwaerme).
 */
import { CARRIERS } from "@/lib/data/reference";
import { GEG_ANLAGE9_EF } from "@/lib/data/emission-factors";
import type { EnergyState } from "@/lib/engine/types";

export type ScopePerspective = "vermieter" | "mieter" | "whole_building";

/** Traeger mit Verbrennung im Gebaeude -> Scope 1. */
const SCOPE1_CARRIERS = new Set([
  "erdgas",
  "biomethan",
  "fluessiggas",
  "heizoel",
  "steinkohle",
  "braunkohle",
  "holz",
  "sonstige",
]);

export interface ScopeSplitInput {
  state: EnergyState;
  areaM2: number | null;
  /** Mietflaechen-Anteil (0..1) an der Gesamtflaeche; Default 0,9. */
  rentalShare?: number;
  perspective: ScopePerspective;
}

export interface ScopeSplitResult {
  perspective: ScopePerspective;
  /** t CO2e/a (null ohne Flaeche). */
  scope1TonnesPerYear: number | null;
  scope2TonnesPerYear: number | null;
  scope3TonnesPerYear: number | null;
  totalTonnesPerYear: number | null;
  /** Intensitaeten (kg CO2e/m2a, auf die Gesamtflaeche bezogen). */
  scope1KgM2a: number;
  scope2KgM2a: number;
  scope3KgM2a: number;
  basis: string;
}

/** Default-Mietflaechenanteil (Allgemeinflaechen ~10 %, GRESB-Faktor). */
export const DEFAULT_RENTAL_SHARE = 0.9;

export function computeGhgScopes(input: ScopeSplitInput): ScopeSplitResult {
  const rentalShare = Math.min(1, Math.max(0, input.rentalShare ?? DEFAULT_RENTAL_SHARE));
  const commonShare = 1 - rentalShare;

  // Gebaeudeweite Intensitaeten je Scope-Kategorie (GEG-Faktorwelt)
  let direct = 0; // Verbrennung im Gebaeude
  let purchased = 0; // Strom/Fernwaerme
  for (const share of input.state.perCarrier) {
    const energy = share.heatKwhM2a + share.electricityKwhM2a;
    const ef = GEG_ANLAGE9_EF[share.carrier] ?? 0;
    const carrier = CARRIERS[share.carrier];
    if (SCOPE1_CARRIERS.has(share.carrier) && !carrier.isElectric)
      direct += energy * ef;
    else purchased += energy * ef;
  }

  let s1: number;
  let s2: number;
  let s3: number;
  let basis: string;
  switch (input.perspective) {
    case "vermieter":
      s1 = direct * commonShare;
      s2 = purchased * commonShare;
      s3 = (direct + purchased) * rentalShare;
      basis = `Operative Kontrolle Vermieter: S1/S2 = Allgemeinflächen (${Math.round(commonShare * 100)} %), S3 = Mietflächen (Downstream Leased Assets, PCAF Cat. 13)`;
      break;
    case "mieter":
      s1 = direct * rentalShare;
      s2 = purchased * rentalShare;
      s3 = (direct + purchased) * commonShare;
      basis = `Mieter-Perspektive (spiegelbildlich): S1/S2 = Mietflächen (${Math.round(rentalShare * 100)} %), S3 = Allgemeinflächen`;
      break;
    case "whole_building":
      s1 = direct;
      s2 = purchased;
      s3 = 0;
      basis = "Whole Building: S1+S2 = gesamtes Gebäude, S3 = 0";
      break;
  }

  const toTonnes = (kgM2a: number): number | null =>
    input.areaM2 != null ? (kgM2a * input.areaM2) / 1000 : null;

  return {
    perspective: input.perspective,
    scope1KgM2a: s1,
    scope2KgM2a: s2,
    scope3KgM2a: s3,
    scope1TonnesPerYear: toTonnes(s1),
    scope2TonnesPerYear: toTonnes(s2),
    scope3TonnesPerYear: toTonnes(s3),
    totalTonnesPerYear: toTonnes(s1 + s2 + s3),
    basis,
  };
}
