/**
 * Extraktions-Schema fuer deutsche Energieausweise (Abbild von
 * energieausweis_schema_v2.json) plus Normalisierung auf die Engine-Eingabe.
 *
 * Das Zod-Schema wird von Claude (Vision) via generateObject befuellt. Felder
 * sind bewusst tolerant (nullable), da aeltere Ausweise / Aushaenge nur eine
 * Teilmenge enthalten.
 */
import { z } from "zod";
import {
  CARRIERS,
  matchCarrier,
  mapToCrremType,
  TYPICAL_WWR,
  TYPICAL_PV_YIELD_KWH_M2A,
  type CarrierKey,
  type CrremType,
} from "@/lib/data/reference";
import { detectCountry } from "@/lib/engine/country";

// ---------------------------------------------------------------------------
// Zod-Schema (Claude-Zielstruktur)
// ---------------------------------------------------------------------------

const perCarrierRow = z.object({
  energietraeger: z.string().describe("Energieträger dieser Zeile"),
  waerme_kwh_m2a: z
    .number()
    .optional()
    .describe("Endenergie für Wärme (Heizung + Warmwasser) kWh/(m²·a)"),
  strom_kwh_m2a: z
    .number()
    .optional()
    .describe("Endenergie Strom (Beleuchtung + Lüftung + Kühlung) kWh/(m²·a)"),
});

const empfehlung = z.object({
  bauteil_anlagenteil: z.string().describe("Bau-/Anlagenteil"),
  empfohlene_massnahme: z.string().describe("Empfohlene Modernisierungsmaßnahme"),
});

export const energieausweisSchema = z.object({
  registriernummer: z.string().optional().describe("Registriernummer (DIBt)"),
  gueltig_bis: z.string().optional().describe("Gültig bis (Datum, ISO oder wie angegeben)"),
  ausstellungsdatum: z.string().optional().describe("Ausstellungsdatum"),
  geg_stand: z.string().optional().describe("Angewendeter GEG-/EnEV-Stand, z. B. 'GEG 16.10.2023'"),
  anlass_ausstellung: z.string().optional().describe("Anlass (Neubau, Vermietung/Verkauf, Aushangpflicht, Modernisierung, Sonstiges)"),

  land: z
    .string()
    .optional()
    .describe("Land des Ausweises (DE/AT/FR/PL), falls erkennbar"),
  heizwaermebedarf_kwh_m2a: z
    .number()
    .optional()
    .describe("Heizwärmebedarf HWB in kWh/(m²·a) (österreichische Ausweise)"),

  gebaeudetyp: z
    .enum(["Wohngebäude", "Nichtwohngebäude"])
    .describe("Diskriminator: Wohngebäude oder Nichtwohngebäude"),
  ausweistyp: z
    .enum(["Bedarfsausweis", "Verbrauchsausweis"])
    .describe("Diskriminator: Bedarfs- oder Verbrauchsausweis"),

  hauptnutzung_gebaeudekategorie: z
    .string()
    .optional()
    .describe("Hauptnutzung / Gebäudekategorie, z. B. Büro, Schule, Wohngebäude"),
  adresse: z.string().optional().describe("Vollständige Adresse (Straße, PLZ, Ort)"),
  baujahr_gebaeude: z.number().int().optional().describe("Baujahr des Gebäudes"),

  energietraeger_heizung: z
    .array(z.string())
    .default([])
    .describe("Wesentliche Energieträger für Heizung (Original-Bezeichnungen)"),

  flaechenart: z
    .string()
    .optional()
    .describe("Bezugsflächenart: Nettogrundfläche (NWG) oder Gebäudenutzfläche A_N (WG)"),
  nettogrundflaeche_m2: z.number().optional().describe("Nettogrundfläche in m² (NWG)"),
  gebaeudenutzflaeche_an_m2: z.number().optional().describe("Gebäudenutzfläche A_N in m² (WG)"),
  wohnflaeche_m2: z.number().optional().describe("Wohnfläche in m² (nur informativ, WG)"),

  energieeffizienzklasse: z
    .string()
    .optional()
    .describe("Energieeffizienzklasse A+…H (nur WG; null bei NWG/alten Ausweisen)"),

  primaerenergie_kwh_m2a: z
    .number()
    .optional()
    .describe("Primärenergiebedarf/-verbrauch (Ist) in kWh/(m²·a)"),
  anforderungswert_pe_kwh_m2a: z
    .number()
    .optional()
    .describe(
      "GEG-/EnEV-Anforderungswert Primärenergie in kWh/(m²·a) (NWG-Bedarfsausweis, Vergleichsbalken)",
    ),
  vergleichswert_waerme_kwh_m2a: z
    .number()
    .optional()
    .describe("Endenergie-Vergleichswert Wärme in kWh/(m²·a) (NWG-Verbrauchsausweis)"),
  vergleichswert_strom_kwh_m2a: z
    .number()
    .optional()
    .describe("Endenergie-Vergleichswert Strom in kWh/(m²·a) (NWG-Verbrauchsausweis)"),
  endenergie_gesamt_kwh_m2a: z
    .number()
    .optional()
    .describe("Endenergie gesamt in kWh/(m²·a), falls ausgewiesen"),
  endenergie_waerme_kwh_m2a: z
    .number()
    .optional()
    .describe("Endenergie Wärme in kWh/(m²·a) (NWG-Pflichtangabe)"),
  endenergie_strom_kwh_m2a: z
    .number()
    .optional()
    .describe("Endenergie Strom in kWh/(m²·a) (NWG-Pflichtangabe)"),
  endenergie_wg_einzelwert_kwh_m2a: z
    .number()
    .optional()
    .describe("WG-Einzelwert Endenergie (Basis der Effizienzklasse) in kWh/(m²·a)"),
  treibhausgasemissionen_kg_co2e_m2a: z
    .number()
    .optional()
    .describe("Treibhausgasemissionen kg CO₂e/(m²·a), falls angegeben (ab GEG 2024)"),

  endenergie_je_traeger: z
    .array(perCarrierRow)
    .default([])
    .describe("Aufschlüsselung der Endenergie nach Energieträger (falls Tabelle vorhanden)"),
  modernisierungsempfehlungen: z
    .array(empfehlung)
    .default([])
    .describe("Empfohlene Modernisierungsmaßnahmen (Seite 4)"),

  konfidenz_kernfelder: z
    .object({
      flaeche: z.enum(["hoch", "mittel", "gering"]).optional(),
      endenergie: z.enum(["hoch", "mittel", "gering"]).optional(),
      primaerenergie: z.enum(["hoch", "mittel", "gering"]).optional(),
      energietraeger: z.enum(["hoch", "mittel", "gering"]).optional(),
      baujahr: z.enum(["hoch", "mittel", "gering"]).optional(),
    })
    .optional()
    .describe(
      "Selbsteinschätzung des Modells: Wie sicher wurde das jeweilige Kernfeld gelesen (Druckqualität, Mehrdeutigkeit)?",
    ),
});

export type EnergieausweisExtraction = z.infer<typeof energieausweisSchema>;

// ---------------------------------------------------------------------------
// Normalisierung -> Engine-Eingabe (engine_mapping)
// ---------------------------------------------------------------------------

export interface CarrierShare {
  carrier: CarrierKey;
  label: string;
  heatKwhM2a: number;
  electricityKwhM2a: number;
}

/**
 * Strukturierte Plausibilitaets-/Konfidenz-Flags je Kernfeld.
 * field referenziert den Feldnamen in NormalizedBuilding (fuer die UI-Markierung).
 */
export type FlagSeverity = "warnung" | "hinweis";

/** Herkunft eines abgeleiteten Werts (WWR/PV). */
export type ValueSource = "bild" | "typologie" | "manuell" | "solar";

export interface PlausibilityFlag {
  field:
    | "bezugsflaecheM2"
    | "heatKwhM2a"
    | "electricityKwhM2a"
    | "primaryKwhM2a"
    | "thgKgM2a"
    | "baujahr"
    | "epcClass"
    | "heatCarrier"
    | "crremType";
  severity: FlagSeverity;
  message: string;
}

export interface NormalizedBuilding {
  // Stammdaten
  registriernummer: string | null;
  adresse: string | null;
  /** Land des Ausweises (GAP-10); fehlend = DE. */
  country?: "DE" | "AT" | "FR" | "PL";
  /** Heizwaermebedarf HWB (AT, Basis der OIB-Klasse); optional. */
  hwbKwhM2a?: number | null;
  hauptnutzung: string | null;
  gebaeudetyp: "Wohngebäude" | "Nichtwohngebäude";
  ausweistyp: "Bedarfsausweis" | "Verbrauchsausweis";
  baujahr: number | null;
  gegStand: string | null;
  gueltigBis: string | null;
  ausstellungsdatum: string | null;

  // CRREM-Zuordnung
  crremType: CrremType;
  crremApproximated: boolean;

  // Flaeche
  bezugsflaecheM2: number | null;
  flaechenart: string | null;
  /** Wohnflaeche (WG, Basis der CO2KostAufG-Aufteilung); optional. */
  wohnflaecheM2?: number | null;

  // Klassifizierung
  epcClass: string | null;

  // Gebaeudehuelle: Fenster-zu-Wand-Anteil (WWR) in Prozent + Herkunft
  wwrPercent: number;
  wwrSource: ValueSource;

  // PV-Potenzial: Ertrag (kWh/m²·a bez. Bezugsflaeche) + Herkunft
  // ("solar" = Google Solar API; "bild" nur noch fuer Alt-Daten)
  pvYieldKwhPerM2: number;
  pvSource: ValueSource;

  // Energie (kWh/m²·a)
  heatKwhM2a: number;
  electricityKwhM2a: number;
  totalKwhM2a: number;
  primaryKwhM2a: number | null;

  // Fraunhofer-Referenzen (NWG, Effizienzklassen-Engine GAP-1); optional,
  // damit Bestandsdaten ohne diese Felder gueltig bleiben.
  peRefKwhM2a?: number | null;
  vergleichswertWaerme?: number | null;
  vergleichswertStrom?: number | null;

  // CO2 (kg CO₂e/m²·a) - null falls nicht im Ausweis (Engine rechnet)
  thgKgM2a: number | null;

  // Traeger
  heatCarrier: CarrierKey;
  heatCarrierLabel: string;
  perCarrier: CarrierShare[];

  // Hinweise / Datenluecken
  notes: string[];

  /** Strukturierte Plausibilitaets-/Konfidenz-Flags (Phase 3). */
  flags: PlausibilityFlag[];

  recommendations: { bauteil: string | null; massnahme: string }[];
}

// ---------------------------------------------------------------------------
// Zod-Schema fuer NormalizedBuilding (API-Validierung der buildings-Routen)
// ---------------------------------------------------------------------------

const carrierKeySchema = z.custom<CarrierKey>(
  (v) => typeof v === "string" && v in CARRIERS,
  "Unbekannter Energieträger",
);

const crremTypeSchema = z.custom<CrremType>(
  (v) => typeof v === "string" && v in TYPICAL_WWR,
  "Unbekannte CRREM-Nutzungsart",
);

const sourceSchema = z.enum(["bild", "typologie", "manuell", "solar"]);

const plausibilityFlagSchema = z.object({
  field: z.enum([
    "bezugsflaecheM2",
    "heatKwhM2a",
    "electricityKwhM2a",
    "primaryKwhM2a",
    "thgKgM2a",
    "baujahr",
    "epcClass",
    "heatCarrier",
    "crremType",
  ]),
  severity: z.enum(["warnung", "hinweis"]),
  message: z.string(),
});

/**
 * Validiert von Clients gesendete NormalizedBuilding-Objekte (POST/PATCH),
 * damit kein beliebiges JSON in der Datenbank landet.
 */
export const normalizedBuildingSchema: z.ZodType<NormalizedBuilding> = z.object({
  registriernummer: z.string().nullable(),
  adresse: z.string().max(500).nullable(),
  country: z.enum(["DE", "AT", "FR", "PL"]).optional(),
  hwbKwhM2a: z.number().min(0).max(1000).nullable().optional(),
  hauptnutzung: z.string().max(200).nullable(),
  gebaeudetyp: z.enum(["Wohngebäude", "Nichtwohngebäude"]),
  ausweistyp: z.enum(["Bedarfsausweis", "Verbrauchsausweis"]),
  baujahr: z.number().nullable(),
  gegStand: z.string().nullable(),
  gueltigBis: z.string().nullable(),
  ausstellungsdatum: z.string().nullable(),
  crremType: crremTypeSchema,
  crremApproximated: z.boolean(),
  bezugsflaecheM2: z.number().nonnegative().nullable(),
  flaechenart: z.string().nullable(),
  wohnflaecheM2: z.number().nonnegative().nullable().optional(),
  epcClass: z.string().max(10).nullable(),
  wwrPercent: z.number().min(0).max(100),
  wwrSource: sourceSchema,
  pvYieldKwhPerM2: z.number().min(0).max(1000),
  pvSource: sourceSchema,
  heatKwhM2a: z.number().min(0).max(10000),
  electricityKwhM2a: z.number().min(0).max(10000),
  totalKwhM2a: z.number().min(0).max(20000),
  primaryKwhM2a: z.number().min(0).max(20000).nullable(),
  peRefKwhM2a: z.number().min(0).max(20000).nullable().optional(),
  vergleichswertWaerme: z.number().min(0).max(20000).nullable().optional(),
  vergleichswertStrom: z.number().min(0).max(20000).nullable().optional(),
  thgKgM2a: z.number().min(0).max(10000).nullable(),
  heatCarrier: carrierKeySchema,
  heatCarrierLabel: z.string().max(100),
  perCarrier: z.array(
    z.object({
      carrier: carrierKeySchema,
      label: z.string().max(100),
      heatKwhM2a: z.number().min(0),
      electricityKwhM2a: z.number().min(0),
    }),
  ),
  notes: z.array(z.string().max(1000)).max(50),
  flags: z.array(plausibilityFlagSchema).max(50),
  recommendations: z
    .array(
      z.object({
        bauteil: z.string().max(500).nullable(),
        massnahme: z.string().max(1000),
      }),
    )
    .max(50),
});

/**
 * Plausibilitaetspruefung der Kernwerte (dokumentierte Wertebereiche fuer
 * deutsche Bestandsgebaeude). Ergaenzt die Modell-Konfidenz um harte Checks.
 */
function checkPlausibility(
  raw: EnergieausweisExtraction,
  vals: {
    bezugsflaecheM2: number | null;
    heatKwhM2a: number;
    electricityKwhM2a: number;
    totalKwhM2a: number;
  },
): PlausibilityFlag[] {
  const flags: PlausibilityFlag[] = [];
  const { bezugsflaecheM2, heatKwhM2a, electricityKwhM2a, totalKwhM2a } = vals;

  // Flaeche
  if (bezugsflaecheM2 == null) {
    flags.push({
      field: "bezugsflaecheM2",
      severity: "warnung",
      message: "Bezugsfläche fehlt – Absolutwerte (t CO₂, €) nicht berechenbar.",
    });
  } else if (bezugsflaecheM2 < 25 || bezugsflaecheM2 > 200000) {
    flags.push({
      field: "bezugsflaecheM2",
      severity: "warnung",
      message: `Bezugsfläche ${Math.round(bezugsflaecheM2)} m² liegt außerhalb des plausiblen Bereichs (25–200.000 m²).`,
    });
  }

  // Endenergie
  if (totalKwhM2a <= 0) {
    flags.push({
      field: "heatKwhM2a",
      severity: "warnung",
      message: "Keine Endenergie erkannt – bitte Werte prüfen/ergänzen.",
    });
  } else {
    if (heatKwhM2a > 600)
      flags.push({
        field: "heatKwhM2a",
        severity: "warnung",
        message: `Endenergie Wärme ${Math.round(heatKwhM2a)} kWh/(m²·a) ist ungewöhnlich hoch (> 600).`,
      });
    else if (heatKwhM2a > 0 && heatKwhM2a < 15)
      flags.push({
        field: "heatKwhM2a",
        severity: "hinweis",
        message: `Endenergie Wärme ${Math.round(heatKwhM2a)} kWh/(m²·a) ist ungewöhnlich niedrig (< 15) – Passivhaus oder Lesefehler?`,
      });
    if (electricityKwhM2a > 350)
      flags.push({
        field: "electricityKwhM2a",
        severity: "warnung",
        message: `Endenergie Strom ${Math.round(electricityKwhM2a)} kWh/(m²·a) ist ungewöhnlich hoch (> 350).`,
      });
  }

  // Primaerenergie: Konsistenz zur Endenergie (PE-Faktoren liegen grob bei 0,2–1,8)
  const pe = raw.primaerenergie_kwh_m2a;
  if (pe != null && totalKwhM2a > 0) {
    const ratio = pe / totalKwhM2a;
    if (ratio < 0.15 || ratio > 3)
      flags.push({
        field: "primaryKwhM2a",
        severity: "warnung",
        message: `Primärenergie (${Math.round(pe)}) passt nicht zur Endenergie (${Math.round(totalKwhM2a)}) – Verhältnis ${ratio.toFixed(1)} außerhalb 0,15–3.`,
      });
  }

  // THG
  if (
    raw.treibhausgasemissionen_kg_co2e_m2a != null &&
    (raw.treibhausgasemissionen_kg_co2e_m2a < 0 ||
      raw.treibhausgasemissionen_kg_co2e_m2a > 250)
  )
    flags.push({
      field: "thgKgM2a",
      severity: "warnung",
      message: `THG-Wert ${Math.round(raw.treibhausgasemissionen_kg_co2e_m2a)} kg CO₂e/(m²·a) außerhalb des plausiblen Bereichs (0–250).`,
    });

  // Baujahr
  const nowYear = new Date().getFullYear();
  if (
    raw.baujahr_gebaeude != null &&
    (raw.baujahr_gebaeude < 1800 || raw.baujahr_gebaeude > nowYear + 1)
  )
    flags.push({
      field: "baujahr",
      severity: "warnung",
      message: `Baujahr ${raw.baujahr_gebaeude} unplausibel (erwartet 1800–${nowYear + 1}).`,
    });

  // EPC-Klasse
  if (
    raw.energieeffizienzklasse &&
    !/^[A-H]\+?$/i.test(raw.energieeffizienzklasse.trim())
  )
    flags.push({
      field: "epcClass",
      severity: "hinweis",
      message: `Effizienzklasse „${raw.energieeffizienzklasse}" ist kein gültiger Wert (A+–H).`,
    });

  // Modell-Konfidenz je Kernfeld -> Flags (nur mittel/gering)
  const conf = raw.konfidenz_kernfelder;
  if (conf) {
    const map: {
      key: keyof NonNullable<typeof conf>;
      field: PlausibilityFlag["field"];
      label: string;
    }[] = [
      { key: "flaeche", field: "bezugsflaecheM2", label: "Bezugsfläche" },
      { key: "endenergie", field: "heatKwhM2a", label: "Endenergie" },
      { key: "primaerenergie", field: "primaryKwhM2a", label: "Primärenergie" },
      { key: "energietraeger", field: "heatCarrier", label: "Energieträger" },
      { key: "baujahr", field: "baujahr", label: "Baujahr" },
    ];
    for (const m of map) {
      const v = conf[m.key];
      if (v === "gering" || v === "mittel")
        flags.push({
          field: m.field,
          severity: v === "gering" ? "warnung" : "hinweis",
          message: `Extraktions-Konfidenz für ${m.label}: ${v} – bitte gegen den Ausweis prüfen.`,
        });
    }
  }

  return flags;
}

/**
 * Leitet die Waerme/Strom-Aufteilung aus der Endenergie-Tabelle (Seite 2) ab.
 *
 * Massgeblich ist der ENERGIETRAEGER jeder Zeile, nicht die Spalte, in der
 * der Wert steht: Netz-/Gruenstrom -> Strom, alle anderen Traeger (inkl.
 * Waermepumpe) -> Waerme. Das macht den Split robust gegen vertauschte
 * Waerme/Strom-Einzelfelder und gegen Spaltenverwechslungen der Extraktion
 * (Bug: Seite-1-Reihenfolge "Erdgas, Strom" wurde als Dominanz gelesen und
 * der Split dadurch invertiert).
 */
function splitFromCarrierTable(
  rows: z.infer<typeof perCarrierRow>[],
): {
  heatKwhM2a: number;
  electricityKwhM2a: number;
  perCarrier: CarrierShare[];
} | null {
  const energyByCarrier = new Map<CarrierKey, number>();
  for (const row of rows) {
    const energy = (row.waerme_kwh_m2a ?? 0) + (row.strom_kwh_m2a ?? 0);
    if (energy <= 0) continue;
    const key = matchCarrier(row.energietraeger);
    energyByCarrier.set(key, (energyByCarrier.get(key) ?? 0) + energy);
  }
  if (energyByCarrier.size === 0) return null;

  let heatKwhM2a = 0;
  let electricityKwhM2a = 0;
  const heatShares: CarrierShare[] = [];
  const elecShares: CarrierShare[] = [];
  for (const [key, energy] of energyByCarrier) {
    const carrier = CARRIERS[key];
    if (key === "strom_netz" || key === "strom_gruen") {
      electricityKwhM2a += energy;
      elecShares.push({
        carrier: key,
        label: carrier.label,
        heatKwhM2a: 0,
        electricityKwhM2a: energy,
      });
    } else {
      heatKwhM2a += energy;
      heatShares.push({
        carrier: key,
        label: carrier.label,
        heatKwhM2a: energy,
        electricityKwhM2a: 0,
      });
    }
  }
  const byEnergyDesc = (a: CarrierShare, b: CarrierShare) =>
    b.heatKwhM2a + b.electricityKwhM2a - (a.heatKwhM2a + a.electricityKwhM2a);
  heatShares.sort(byEnergyDesc);
  elecShares.sort(byEnergyDesc);
  return {
    heatKwhM2a,
    electricityKwhM2a,
    perCarrier: [...heatShares, ...elecShares],
  };
}

/**
 * Setzt die (evtl. lueckenhafte) Extraktion in eine vollstaendige Engine-Eingabe um.
 * Loest die Polymorphie WG/NWG und Bedarf/Verbrauch auf und dokumentiert Annahmen.
 */
export function normalizeExtraction(
  raw: EnergieausweisExtraction,
): NormalizedBuilding {
  const notes: string[] = [];
  const isWG = raw.gebaeudetyp === "Wohngebäude";

  // Bezugsflaeche (polymorph)
  const bezugsflaecheM2 = isWG
    ? raw.gebaeudenutzflaeche_an_m2 ?? raw.wohnflaeche_m2 ?? null
    : raw.nettogrundflaeche_m2 ?? null;
  if (bezugsflaecheM2 == null) notes.push("Bezugsfläche fehlt – Absolutwerte (t CO₂, €) nicht berechenbar.");

  // Energievektor Waerme/Strom bestimmen
  let heatKwhM2a = 0;
  let electricityKwhM2a = 0;
  let tablePerCarrier: CarrierShare[] | null = null;
  const extraFlags: PlausibilityFlag[] = [];

  if (isWG) {
    // WG: i. d. R. ein Einzelwert (Heizung + Warmwasser), kein Haushaltsstrom.
    const einzel =
      raw.endenergie_wg_einzelwert_kwh_m2a ??
      raw.endenergie_gesamt_kwh_m2a ??
      raw.endenergie_waerme_kwh_m2a ??
      0;
    heatKwhM2a = einzel;
    electricityKwhM2a = 0;
    notes.push(
      "Wohngebäude: Endenergie enthält i. d. R. keinen Haushaltsstrom (Stromlücke) – strombasierte Werte sind untererfasst.",
    );
  } else {
    // NWG: getrennte Waerme-/Stromwerte. Verlaesslichste Quelle fuer den
    // Traeger-Split ist die Endenergie-Tabelle auf Seite 2 (je Zeile ein
    // Traeger, Zuordnung ueber den Traegernamen). Die separaten Waerme-/
    // Strom-Einzelfelder koennen vertauscht sein, wenn die Extraktion die
    // Reihenfolge der "Wesentlichen Energietraeger" (Seite 1) faelschlich
    // als Dominanz interpretiert.
    const aggHeat = raw.endenergie_waerme_kwh_m2a ?? 0;
    const aggElec = raw.endenergie_strom_kwh_m2a ?? 0;
    const table = splitFromCarrierTable(raw.endenergie_je_traeger ?? []);
    const tableTotal = table ? table.heatKwhM2a + table.electricityKwhM2a : 0;
    const refTotal =
      aggHeat + aggElec > 0 ? aggHeat + aggElec : raw.endenergie_gesamt_kwh_m2a ?? 0;
    // Tabelle nur uebernehmen, wenn ihre Summe zur Gesamt-Endenergie passt
    // (±10 %) – sonst ist die Tabelle selbst unvollstaendig/fehlerhaft gelesen.
    const tableConsistent =
      table != null &&
      (refTotal <= 0 || Math.abs(tableTotal - refTotal) / refTotal <= 0.1);

    if (table && tableConsistent) {
      heatKwhM2a = table.heatKwhM2a;
      electricityKwhM2a = table.electricityKwhM2a;
      tablePerCarrier = table.perCarrier;
      const drift = Math.abs(aggHeat - heatKwhM2a);
      if (aggHeat + aggElec > 0 && drift > Math.max(2, 0.05 * tableTotal)) {
        const fmt = (v: number) => v.toFixed(1).replace(".", ",");
        notes.push(
          `Wärme/Strom-Aufteilung aus der Endenergietabelle (Seite 2) abgeleitet: Wärme ${fmt(heatKwhM2a)} / Strom ${fmt(electricityKwhM2a)} kWh/(m²·a). Die separaten Wärme-/Strom-Felder (${fmt(aggHeat)} / ${fmt(aggElec)}) waren dazu inkonsistent (vermutlich vertauschte Zuordnung) und wurden korrigiert.`,
        );
        extraFlags.push({
          field: "heatKwhM2a",
          severity: "hinweis",
          message:
            "Wärme/Strom-Zuordnung wurde anhand der Endenergietabelle (Seite 2) korrigiert – bitte gegen den Ausweis prüfen.",
        });
      }
    } else {
      heatKwhM2a = aggHeat;
      electricityKwhM2a = aggElec;
      if (!heatKwhM2a && !electricityKwhM2a && raw.endenergie_gesamt_kwh_m2a) {
        // Nur Gesamtwert vorhanden -> grob 70/30 Waerme/Strom annehmen.
        heatKwhM2a = raw.endenergie_gesamt_kwh_m2a * 0.7;
        electricityKwhM2a = raw.endenergie_gesamt_kwh_m2a * 0.3;
        notes.push("Keine Wärme/Strom-Aufteilung im Ausweis – Näherung 70/30 angewandt.");
      }
      if (table && !tableConsistent)
        notes.push(
          "Endenergietabelle (Seite 2) passt nicht zur Gesamt-Endenergie und wurde für den Träger-Split ignoriert.",
        );
    }
  }

  const totalKwhM2a = heatKwhM2a + electricityKwhM2a;

  // Haupt-Waermetraeger. Fallback fuer Determinismus: wenn das Feld fehlt,
  // den dominanten Waermetraeger aus der (traegerbasiert gebuckelten)
  // Tabelle ableiten.
  let heatCarrierKey = matchCarrier(raw.energietraeger_heizung?.[0]);
  if (heatCarrierKey === "sonstige" && tablePerCarrier) {
    const domHeat = tablePerCarrier.find((s) => s.heatKwhM2a > 0);
    if (domHeat) heatCarrierKey = domHeat.carrier;
  }
  if (heatCarrierKey === "sonstige") {
    const withHeat = (raw.endenergie_je_traeger ?? [])
      .filter((r) => (r.waerme_kwh_m2a ?? 0) > 0)
      .sort((a, b) => (b.waerme_kwh_m2a ?? 0) - (a.waerme_kwh_m2a ?? 0));
    if (withHeat.length > 0)
      heatCarrierKey = matchCarrier(withHeat[0].energietraeger);
  }
  const heatCarrier = CARRIERS[heatCarrierKey];

  // Traeger-Aufschluesselung: bevorzugt aus der Endenergietabelle (Seite 2),
  // in der jede Zeile ueber ihren Traegernamen gebucketet wurde (siehe
  // splitFromCarrierTable). Fallback ohne verwertbare Tabelle: stabile
  // Zwei-Topf-Ableitung Waerme -> Haupt-Waermetraeger, Strom -> Netzstrom.
  const perCarrier: CarrierShare[] = tablePerCarrier ?? [];
  if (!tablePerCarrier) {
    if (heatKwhM2a > 0) {
      perCarrier.push({
        carrier: heatCarrierKey,
        label: heatCarrier.label,
        heatKwhM2a,
        electricityKwhM2a: 0,
      });
    }
    if (electricityKwhM2a > 0) {
      perCarrier.push({
        carrier: "strom_netz",
        label: CARRIERS.strom_netz.label,
        heatKwhM2a: 0,
        electricityKwhM2a,
      });
    }
  }

  const { code: crremType, approximated } = mapToCrremType(
    raw.hauptnutzung_gebaeudekategorie,
    raw.gebaeudetyp,
  );
  if (approximated)
    notes.push(
      `CRREM-Nutzungsart „${raw.hauptnutzung_gebaeudekategorie ?? "?"}" näherungsweise als „${crremType}" eingestuft.`,
    );

  if (raw.treibhausgasemissionen_kg_co2e_m2a == null)
    notes.push("Keine THG-Angabe im Ausweis (vor GEG 2024) – CO₂ wird aus Energieträgern berechnet.");

  const flags = checkPlausibility(raw, {
    bezugsflaecheM2,
    heatKwhM2a,
    electricityKwhM2a,
    totalKwhM2a,
  });
  flags.push(...extraFlags);

  return {
    registriernummer: raw.registriernummer ?? null,
    adresse: raw.adresse ?? null,
    country: detectCountry({ land: raw.land ?? null, adresse: raw.adresse ?? null }),
    hwbKwhM2a: raw.heizwaermebedarf_kwh_m2a ?? null,
    hauptnutzung: raw.hauptnutzung_gebaeudekategorie ?? null,
    gebaeudetyp: raw.gebaeudetyp,
    ausweistyp: raw.ausweistyp,
    baujahr: raw.baujahr_gebaeude ?? null,
    gegStand: raw.geg_stand ?? null,
    gueltigBis: raw.gueltig_bis ?? null,
    ausstellungsdatum: raw.ausstellungsdatum ?? null,
    crremType,
    crremApproximated: approximated,
    bezugsflaecheM2,
    flaechenart: raw.flaechenart ?? null,
    wohnflaecheM2: raw.wohnflaeche_m2 ?? null,
    epcClass: raw.energieeffizienzklasse ?? null,
    wwrPercent: TYPICAL_WWR[crremType],
    wwrSource: "typologie",
    pvYieldKwhPerM2: TYPICAL_PV_YIELD_KWH_M2A,
    pvSource: "typologie",
    heatKwhM2a,
    electricityKwhM2a,
    totalKwhM2a,
    primaryKwhM2a: raw.primaerenergie_kwh_m2a ?? null,
    peRefKwhM2a: raw.anforderungswert_pe_kwh_m2a ?? null,
    vergleichswertWaerme: raw.vergleichswert_waerme_kwh_m2a ?? null,
    vergleichswertStrom: raw.vergleichswert_strom_kwh_m2a ?? null,
    thgKgM2a: raw.treibhausgasemissionen_kg_co2e_m2a ?? null,
    heatCarrier: heatCarrierKey,
    heatCarrierLabel: heatCarrier.label,
    perCarrier,
    notes,
    flags,
    recommendations: (raw.modernisierungsempfehlungen ?? []).map((e) => ({
      bauteil: e.bauteil_anlagenteil ?? null,
      massnahme: e.empfohlene_massnahme,
    })),
  };
}
