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

export interface NormalizedBuilding {
  // Stammdaten
  registriernummer: string | null;
  adresse: string | null;
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

  // Klassifizierung
  epcClass: string | null;

  // Gebaeudehuelle: Fenster-zu-Wand-Anteil (WWR) in Prozent + Herkunft
  wwrPercent: number;
  wwrSource: "bild" | "typologie" | "manuell";

  // PV-Potenzial: Ertrag (kWh/m²·a bez. Bezugsflaeche) + Herkunft
  pvYieldKwhPerM2: number;
  pvSource: "bild" | "typologie" | "manuell";

  // Energie (kWh/m²·a)
  heatKwhM2a: number;
  electricityKwhM2a: number;
  totalKwhM2a: number;
  primaryKwhM2a: number | null;

  // CO2 (kg CO₂e/m²·a) - null falls nicht im Ausweis (Engine rechnet)
  thgKgM2a: number | null;

  // Traeger
  heatCarrier: CarrierKey;
  heatCarrierLabel: string;
  perCarrier: CarrierShare[];

  // Hinweise / Datenluecken
  notes: string[];

  recommendations: { bauteil: string | null; massnahme: string }[];
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
    // NWG: getrennte Waerme-/Stromwerte.
    heatKwhM2a = raw.endenergie_waerme_kwh_m2a ?? 0;
    electricityKwhM2a = raw.endenergie_strom_kwh_m2a ?? 0;
    if (!heatKwhM2a && !electricityKwhM2a && raw.endenergie_gesamt_kwh_m2a) {
      // Nur Gesamtwert vorhanden -> grob 70/30 Waerme/Strom annehmen.
      heatKwhM2a = raw.endenergie_gesamt_kwh_m2a * 0.7;
      electricityKwhM2a = raw.endenergie_gesamt_kwh_m2a * 0.3;
      notes.push("Keine Wärme/Strom-Aufteilung im Ausweis – Näherung 70/30 angewandt.");
    }
  }

  const totalKwhM2a = heatKwhM2a + electricityKwhM2a;

  // Haupt-Waermetraeger. Fallback fuer Determinismus: wenn das Feld fehlt,
  // den Traeger mit der groessten Waerme-Endenergie aus der Tabelle ableiten.
  let heatCarrierKey = matchCarrier(raw.energietraeger_heizung?.[0]);
  if (heatCarrierKey === "sonstige") {
    const withHeat = (raw.endenergie_je_traeger ?? [])
      .filter((r) => (r.waerme_kwh_m2a ?? 0) > 0)
      .sort((a, b) => (b.waerme_kwh_m2a ?? 0) - (a.waerme_kwh_m2a ?? 0));
    if (withHeat.length > 0)
      heatCarrierKey = matchCarrier(withHeat[0].energietraeger);
  }
  const heatCarrier = CARRIERS[heatCarrierKey];

  // Traeger-Aufschluesselung DETERMINISTISCH aus den stabilen Gesamtwerten
  // ableiten (nicht aus der optionalen Tabelle, deren Zeilen je nach Modell-Lauf
  // variieren koennen): Waerme -> Haupt-Waermetraeger, Strom -> Netzstrom.
  const perCarrier: CarrierShare[] = [];
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

  return {
    registriernummer: raw.registriernummer ?? null,
    adresse: raw.adresse ?? null,
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
    epcClass: raw.energieeffizienzklasse ?? null,
    wwrPercent: TYPICAL_WWR[crremType],
    wwrSource: "typologie",
    pvYieldKwhPerM2: TYPICAL_PV_YIELD_KWH_M2A,
    pvSource: "typologie",
    heatKwhM2a,
    electricityKwhM2a,
    totalKwhM2a,
    primaryKwhM2a: raw.primaerenergie_kwh_m2a ?? null,
    thgKgM2a: raw.treibhausgasemissionen_kg_co2e_m2a ?? null,
    heatCarrier: heatCarrierKey,
    heatCarrierLabel: heatCarrier.label,
    perCarrier,
    notes,
    recommendations: (raw.modernisierungsempfehlungen ?? []).map((e) => ({
      bauteil: e.bauteil_anlagenteil ?? null,
      massnahme: e.empfohlene_massnahme,
    })),
  };
}
