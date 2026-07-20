/**
 * CO2-Kostenaufteilung Mieter/Vermieter nach CO2KostAufG (GAP-3, Spez. 2.3).
 *
 * Wohngebaeude: 10-Stufenmodell (Anlage zu §§ 5-7 CO2KostAufG, BGBl. I 2022,
 * 2159 - validiert gegen den Gesetzestext). Der CO2-Ausstoss pro m²
 * Wohnflaeche wird nach § 5 Abs. 1 auf EINE Nachkommastelle gerundet,
 * bevor die Stufe bestimmt wird; Abrechnungszeitraeume != 12 Monate werden
 * auf 12 Monate hochgerechnet.
 *
 * Nichtwohngebaeude: 50/50 (§ 8; Vereinbarungen mit Mieteranteil > 50 %
 * sind unwirksam). Das in § 8 Abs. 4 angekuendigte NWG-Stufenmodell ist bis
 * heute (07/2026) nicht in Kraft - als vorbereitete, deaktivierte Tabelle
 * hinterlegt (Rechtsstand vor Aktivierung pruefen).
 *
 * Faktor-Hygiene (Spez. 2.5): ausschliesslich EBeV-Faktoren (ohne Vorkette).
 */
import { ebevCo2KgPerKwh } from "@/lib/data/reference";
import { roundCo2KostAufG } from "@/lib/engine/numerics";
import type { EnergyState } from "@/lib/engine/types";

/**
 * 10-Stufenmodell Wohngebaeude: Vermieteranteil nach CO2-Ausstoss pro m²
 * Wohnflaeche und Jahr. Grenzen: [min, max) - "< 12 kg" bis ">= 52 kg".
 */
export const CO2KOSTAUFG_STUFEN_WG: {
  minKgM2a: number;
  maxKgM2a: number | null;
  vermieterAnteil: number;
}[] = [
  { minKgM2a: 0, maxKgM2a: 12, vermieterAnteil: 0.0 },
  { minKgM2a: 12, maxKgM2a: 17, vermieterAnteil: 0.1 },
  { minKgM2a: 17, maxKgM2a: 22, vermieterAnteil: 0.2 },
  { minKgM2a: 22, maxKgM2a: 27, vermieterAnteil: 0.3 },
  { minKgM2a: 27, maxKgM2a: 32, vermieterAnteil: 0.4 },
  { minKgM2a: 32, maxKgM2a: 37, vermieterAnteil: 0.5 },
  { minKgM2a: 37, maxKgM2a: 42, vermieterAnteil: 0.6 },
  { minKgM2a: 42, maxKgM2a: 47, vermieterAnteil: 0.7 },
  { minKgM2a: 47, maxKgM2a: 52, vermieterAnteil: 0.8 },
  { minKgM2a: 52, maxKgM2a: null, vermieterAnteil: 0.95 },
];

/**
 * NWG-Stufenmodell nach § 8 Abs. 4 CO2KostAufG: angekuendigt, aber bis
 * 07/2026 NICHT in Kraft. Deaktiviert vorbereitet; bei Inkrafttreten
 * Werte aus der Verordnung eintragen und Flag aktivieren.
 */
export const CO2KOSTAUFG_NWG_STUFENMODELL_AKTIV = false;

/** NWG-Aufteilung nach § 8: 50/50. */
export const CO2KOSTAUFG_NWG_VERMIETER_ANTEIL = 0.5;

export interface Co2CostSplitResult {
  /** Massgeblicher (gerundeter) CO2-Ausstoss pro m² Wohnflaeche und Jahr. */
  co2KgM2aRounded: number;
  /** Stufe (1-10) im WG-Modell; null bei NWG. */
  stufe: number | null;
  vermieterAnteil: number;
  mieterAnteil: number;
  /** Gesamte CO2-Kosten des Jahres (EUR), falls Flaeche + Preis bekannt. */
  totalEurPerYear: number | null;
  vermieterEurPerYear: number | null;
  mieterEurPerYear: number | null;
  /** Rechtsgrundlage fuer Report/UI. */
  basis: string;
}

/** Vermieteranteil im WG-10-Stufenmodell fuer einen CO2-Ausstoss (kg/m²a). */
export function vermieterAnteilWG(co2KgM2a: number): {
  stufe: number;
  anteil: number;
} {
  const rounded = roundCo2KostAufG(co2KgM2a);
  for (let i = 0; i < CO2KOSTAUFG_STUFEN_WG.length; i++) {
    const s = CO2KOSTAUFG_STUFEN_WG[i];
    if (s.maxKgM2a === null || rounded < s.maxKgM2a)
      return { stufe: i + 1, anteil: s.vermieterAnteil };
  }
  const last = CO2KOSTAUFG_STUFEN_WG.length;
  return { stufe: last, anteil: CO2KOSTAUFG_STUFEN_WG[last - 1].vermieterAnteil };
}

/**
 * CO2-Kostenaufteilung fuer ein Gebaeude und Jahr.
 *
 * @param state Energiezustand (kWh/m²·a je Traeger)
 * @param gebaeudetyp WG -> 10-Stufenmodell, NWG -> 50/50
 * @param wohnflaecheM2 Bezugsflaeche der Aufteilung (WG: Wohnflaeche)
 * @param co2PriceEurPerT CO2-Preis des Abrechnungsjahres (EUR/t)
 * @param abrechnungsMonate Abrechnungszeitraum (Default 12; § 5 Abs. 1:
 *        auf 12 Monate hochrechnen)
 */
export function computeCo2CostSplit(
  state: EnergyState,
  gebaeudetyp: "Wohngebäude" | "Nichtwohngebäude",
  wohnflaecheM2: number | null,
  co2PriceEurPerT: number,
  abrechnungsMonate = 12,
): Co2CostSplitResult {
  // CO2-Intensitaet nach EBeV (nur bepreiste Traeger, ohne Vorkette)
  let kgM2a = 0;
  for (const share of state.perCarrier) {
    const factor = ebevCo2KgPerKwh(share.carrier);
    if (factor == null) continue;
    kgM2a += (share.heatKwhM2a + share.electricityKwhM2a) * factor;
  }
  // Hochrechnung auf 12 Monate (§ 5 Abs. 1)
  if (abrechnungsMonate !== 12 && abrechnungsMonate > 0)
    kgM2a = (kgM2a / abrechnungsMonate) * 12;

  const rounded = roundCo2KostAufG(kgM2a);

  let stufe: number | null = null;
  let vermieterAnteil: number;
  let basis: string;
  if (gebaeudetyp === "Wohngebäude") {
    const result = vermieterAnteilWG(rounded);
    stufe = result.stufe;
    vermieterAnteil = result.anteil;
    basis = `CO2KostAufG §§ 5–7 (10-Stufenmodell, Stufe ${result.stufe}: ${Math.round(result.anteil * 100)} % Vermieter)`;
  } else {
    vermieterAnteil = CO2KOSTAUFG_NWG_VERMIETER_ANTEIL;
    basis = "CO2KostAufG § 8 (Nichtwohngebäude: 50/50; NWG-Stufenmodell noch nicht in Kraft)";
  }
  const mieterAnteil = 1 - vermieterAnteil;

  const totalEurPerYear =
    wohnflaecheM2 != null
      ? ((kgM2a * wohnflaecheM2) / 1000) * co2PriceEurPerT
      : null;

  return {
    co2KgM2aRounded: rounded,
    stufe,
    vermieterAnteil,
    mieterAnteil,
    totalEurPerYear,
    vermieterEurPerYear:
      totalEurPerYear != null ? totalEurPerYear * vermieterAnteil : null,
    mieterEurPerYear:
      totalEurPerYear != null ? totalEurPerYear * mieterAnteil : null,
    basis,
  };
}
