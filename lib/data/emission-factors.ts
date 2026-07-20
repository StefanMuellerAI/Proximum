/**
 * Emissionsfaktor-Datenbanken (GAP-8, Spez. 2.5): zwei umschaltbare Welten
 * fuer CO2e-Intensitaeten (die dritte Welt, EBeV, lebt in reference.ts und
 * ist ausschliesslich fuer CO2-Abgabe/CO2KostAufG).
 *
 * Regeln (Spez. 2.5):
 *  1. Direkt verbrannte fossile Traeger bleiben ueber die Zeit KONSTANT;
 *     nur netzgebundene (Strom, Fernwaerme) sinken.
 *  2. Umschaltung CRREM <-> nationale Verordnung pro Portfolio; Wechsel
 *     loest Neuberechnung aus (Recompute-DAG); Reports bleiben Snapshots.
 *  3. Energielieferanten: eigene EF-/PEF-Zeitreihen bis 2050. Im
 *     CRREM-Modus eigene EF nur fuer Strom-Mix (Fernwaerme/Gruenstrom
 *     skalieren proportional zum Netzpfad).
 *  4. PV-Strom: EF 0,0 und PEF 0,0.
 */
import type { CarrierKey } from "@/lib/data/reference";

/**
 * CRREM-Standardfaktoren (kg CO2e/kWh, Basisjahr 2020, DE).
 * Strom folgt dem zeitvariablen Netzpfad (crrem-de.json gridEf);
 * Fernwaerme skaliert proportional zum Netzpfad (netzgebunden).
 */
export const CRREM_EF_2020: Partial<Record<CarrierKey, number>> = {
  erdgas: 0.183,
  heizoel: 0.247,
  fluessiggas: 0.214,
  steinkohle: 0.345,
  braunkohle: 0.345,
  holz: 0.015,
  fernwaerme_fossil: 0.297,
  fernwaerme_kwk: 0.297, // CRREM kennt nur fossil/regenerativ; KWK = fossil
  nahwaerme: 0.297,
  strom_netz: 0.339, // Basisjahr; Zeitreihe via gridEf
  strom_gruen: 0.0,
  waermepumpe: 0.339, // Endenergie ist Strom -> Netzpfad
  solarthermie: 0.0,
  abwaerme: 0.056, // wie FW regenerativ
  sonstige: 0.25,
};

/** CRREM: Traeger, die dem Strom-Netzpfad folgen. */
export const CRREM_GRID_CARRIERS: CarrierKey[] = [
  "strom_netz",
  "waermepumpe",
];

/** CRREM: netzgebundene Waerme, skaliert proportional zum Strompfad. */
export const CRREM_HEAT_NETWORK_CARRIERS: CarrierKey[] = [
  "fernwaerme_fossil",
  "fernwaerme_kwk",
  "nahwaerme",
];

/**
 * GEG Anlage 9 (kg CO2e/kWh, mit Vorkette) - nationale Verordnung DE.
 * Zeitkonstant (Ausweis-Logik rechnet nicht mit Dekarbonisierungspfaden).
 */
export const GEG_ANLAGE9_EF: Partial<Record<CarrierKey, number>> = {
  erdgas: 0.24,
  heizoel: 0.31,
  fluessiggas: 0.27,
  steinkohle: 0.4,
  braunkohle: 0.43,
  holz: 0.02,
  fernwaerme_fossil: 0.3, // FW Heizwerk Gas (Kohle 0,4 / regenerativ 0,06)
  fernwaerme_kwk: 0.18, // FW KWK Gas (Kohle 0,3 / regenerativ 0,04)
  nahwaerme: 0.3,
  strom_netz: 0.56,
  strom_gruen: 0.0,
  waermepumpe: 0.56,
  solarthermie: 0.0,
  abwaerme: 0.06,
  sonstige: 0.3,
};

export const EF_DATABASE_LABELS = {
  crrem: "CRREM v2.05 (Basisjahr 2020, zeitvariable Netzpfade)",
  geg: "GEG Anlage 9 (nationale Verordnung, mit Vorkette)",
} as const;

/**
 * Lieferanten-Override: eigene EF-Zeitreihe (kg CO2e/kWh) je Traeger
 * (energy_suppliers.efSeries). Im CRREM-Modus nur fuer Strom-Mix zulaessig.
 */
export type SupplierEfSeries = Partial<
  Record<CarrierKey, Record<number, number>>
>;
