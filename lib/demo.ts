/**
 * Demo-Datensatz (echter Test-Energieausweis „Panoramaschule Frankfurt",
 * ECHT_1). Erlaubt die Nutzung des Dashboards ohne API-Key / Upload.
 */
import type { EnergieausweisExtraction, NormalizedBuilding } from "@/lib/schema";
import { normalizeExtraction } from "@/lib/schema";

export const demoExtraction: EnergieausweisExtraction = {
  registriernummer: "HE-2025-005525089",
  gueltig_bis: "2034-01-20",
  ausstellungsdatum: "2024-01-20",
  geg_stand: "GEG vom 16.10.2023",
  anlass_ausstellung: "Aushangpflicht",
  gebaeudetyp: "Nichtwohngebäude",
  ausweistyp: "Verbrauchsausweis",
  hauptnutzung_gebaeudekategorie: "Schulen",
  adresse: "Werner-Bockelmann-Straße 3, 65934 Frankfurt am Main",
  baujahr_gebaeude: 2011,
  energietraeger_heizung: ["Erdgas"],
  flaechenart: "Nettogrundfläche (NWG)",
  nettogrundflaeche_m2: 6971,
  gebaeudenutzflaeche_an_m2: undefined,
  wohnflaeche_m2: undefined,
  energieeffizienzklasse: undefined,
  primaerenergie_kwh_m2a: 109.62,
  endenergie_gesamt_kwh_m2a: 85,
  endenergie_waerme_kwh_m2a: 61,
  endenergie_strom_kwh_m2a: 24,
  endenergie_wg_einzelwert_kwh_m2a: undefined,
  treibhausgasemissionen_kg_co2e_m2a: 28,
  endenergie_je_traeger: [
    { energietraeger: "Erdgas", waerme_kwh_m2a: 61, strom_kwh_m2a: undefined },
    { energietraeger: "Strom (Netzmix)", waerme_kwh_m2a: undefined, strom_kwh_m2a: 24 },
  ],
  modernisierungsempfehlungen: [
    { bauteil_anlagenteil: "Dach", empfohlene_massnahme: "Abdichtung des Daches von Bauteil A und der Turnhalle" },
    { bauteil_anlagenteil: "Beleuchtung", empfohlene_massnahme: "Einsatz LED-Beleuchtung" },
    { bauteil_anlagenteil: "Sonstiges", empfohlene_massnahme: "Austausch ungeregelter Pumpen gegen Hocheffizienzpumpen" },
  ],
};

export function getDemo(): {
  extraction: EnergieausweisExtraction;
  normalized: NormalizedBuilding;
} {
  return { extraction: demoExtraction, normalized: normalizeExtraction(demoExtraction) };
}
