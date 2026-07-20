/**
 * Multi-Country-Schicht (GAP-10): AT, FR, PL neben DE.
 *
 * - Laenderspezifische CRREM-Strom-Basisfaktoren (2020, Spez. 2.5)
 * - AT: Effizienzklasse ueber HWB (OIB) - Registry-Daten aus B1
 * - FR: DPE-PE-Rueckrechnung (Primaer- -> Endenergie, PEF Strom 2,3)
 * - PL: PE-Klassen nur WG - Registry-Daten aus B1
 *
 * Landesspezifische Taxonomie-Schwellen (AT/FR/PL) sind als Registry-
 * Overrides vorgesehen (regulation_versions, kind "effizienzklassen"/
 * "emissionsfaktoren"); bis zur Datenpflege gelten die DE-Tabellen mit
 * dokumentiertem Hinweis.
 */
import type { ClassCountry } from "@/lib/data/efficiency-classes";

export type Country = ClassCountry; // "DE" | "AT" | "PL" | "FR"

/** CRREM-Strom-Mix-Basisfaktoren 2020 (kg CO2e/kWh, Spez. 2.5). */
export const CRREM_GRID_EF_2020_BY_COUNTRY: Record<Country, number> = {
  DE: 0.339,
  AT: 0.111,
  PL: 0.76,
  FR: 0.051,
};

/** Fernwaerme-Basisfaktoren 2020 (fossil, kg CO2e/kWh). */
export const CRREM_HEAT_NETWORK_EF_2020_BY_COUNTRY: Record<Country, number> = {
  DE: 0.297,
  AT: 0.16,
  PL: 0.35,
  FR: 0.12,
};

/**
 * Skaliert den DE-Netzpfad auf ein anderes Land: gleicher relativer
 * Dekarbonisierungsverlauf, nationales Basisniveau 2020 (dokumentierte
 * Naeherung, bis die nationalen CRREM-Pfade als Daten extrahiert sind).
 */
export function countryGridEf(
  country: Country,
  deGridEfForYear: number,
  deGridEf2020: number,
): number {
  if (country === "DE" || deGridEf2020 <= 0) return deGridEfForYear;
  const ratio = deGridEfForYear / deGridEf2020;
  return CRREM_GRID_EF_2020_BY_COUNTRY[country] * ratio;
}

// ---------------------------------------------------------------------------
// FR: DPE-PE-Rueckrechnung
// ---------------------------------------------------------------------------

/** Franzoesischer PEF Strom (DPE-Konvention seit 2021). */
export const FR_PEF_ELECTRICITY = 2.3;

/**
 * DPE weist Primaerenergie aus; die Endenergie wird zurueckgerechnet:
 * Strom-Anteil / 2,3, uebrige Traeger 1:1 (PEF 1,0 im DPE).
 */
export function frFinalEnergyFromPrimary(
  primaryKwhM2a: number,
  electricShare: number,
): number {
  const share = Math.min(1, Math.max(0, electricShare));
  const electricPe = primaryKwhM2a * share;
  const otherPe = primaryKwhM2a * (1 - share);
  return electricPe / FR_PEF_ELECTRICITY + otherPe;
}

// ---------------------------------------------------------------------------
// Landerkennung aus dem Ausweis (Parser-Landeslogik)
// ---------------------------------------------------------------------------

/** Erkennung aus explizitem Feld, Adresse (PLZ-Format) oder Ausweis-Typ. */
export function detectCountry(input: {
  land?: string | null;
  adresse?: string | null;
}): Country {
  const explicit = (input.land ?? "").toUpperCase().trim();
  if (explicit === "AT" || /österreich|austria/i.test(input.land ?? "")) return "AT";
  if (explicit === "FR" || /frankreich|france/i.test(input.land ?? "")) return "FR";
  if (explicit === "PL" || /polen|poland|polska/i.test(input.land ?? "")) return "PL";
  if (explicit === "DE" || /deutschland|germany/i.test(input.land ?? "")) return "DE";

  const addr = input.adresse ?? "";
  // AT: 4-stellige PLZ + typische Ortsangabe; FR: 5-stellig beginnend 0-9 +
  // franzoesische Kennungen; PL: NN-NNN
  if (/\b\d{2}-\d{3}\b/.test(addr)) return "PL";
  if (/\bF-\d{5}\b|,\s*France\b/i.test(addr)) return "FR";
  if (/\bA-\d{4}\b|,\s*(Österreich|Austria)\b/i.test(addr)) return "AT";
  return "DE";
}
