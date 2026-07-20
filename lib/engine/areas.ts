/**
 * Flaechenumrechnung (Spez. 2.10-6):
 *   BGF = NGF / 0,85
 *   MF  = EBF x 0,84 (Wohngebaeude) bzw. EBF x 0,96 (Nichtwohngebaeude)
 *   AF  = MF x GRESB-Faktor (Allgemeinflaechen-Anteil)
 */

export const NGF_TO_BGF_DIVISOR = 0.85;
export const EBF_TO_MF_WG = 0.84;
export const EBF_TO_MF_NWG = 0.96;

/**
 * GRESB-Default fuer den Allgemeinflaechen-Anteil an der Mietflaeche.
 * Konfigurierbar je Gebaeude (rental_areas), Default dokumentiert.
 */
export const GRESB_COMMON_AREA_FACTOR = 0.1;

/** Bruttogrundflaeche aus Nettogrundflaeche. */
export function bgfFromNgf(ngfM2: number): number {
  return ngfM2 / NGF_TO_BGF_DIVISOR;
}

/** Mietflaeche aus Energiebezugsflaeche. */
export function mfFromEbf(
  ebfM2: number,
  gebaeudetyp: "Wohngebäude" | "Nichtwohngebäude",
): number {
  return ebfM2 * (gebaeudetyp === "Wohngebäude" ? EBF_TO_MF_WG : EBF_TO_MF_NWG);
}

/** Allgemeinflaeche aus Mietflaeche (GRESB-Faktor). */
export function afFromMf(mfM2: number, factor = GRESB_COMMON_AREA_FACTOR): number {
  return mfM2 * factor;
}
