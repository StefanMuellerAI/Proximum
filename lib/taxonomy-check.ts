/**
 * EU-Taxonomie-Check-Workflow (GAP-13): Fragebogen-Report mit Dashboard
 * und UNVERAENDERLICHER Momentaufnahme (Snapshot bei Abschluss).
 *
 * Der Fragebogen ergaenzt das automatische Screening (Substantial
 * Contribution + DNSH Klimaanpassung) um die manuell zu belegenden
 * DNSH-Kriterien und Mindestschutz-Fragen.
 */

export interface TaxonomyQuestion {
  id: string;
  criterion:
    | "substantial_contribution"
    | "dnsh_adaptation"
    | "dnsh_water"
    | "dnsh_circular"
    | "dnsh_pollution"
    | "dnsh_biodiversity"
    | "minimum_safeguards";
  text: string;
  hint?: string;
  /** auto = aus dem Screening vorbelegt; manual = Nutzer-Nachweis. */
  mode: "auto" | "manual";
}

export const TAXONOMY_QUESTIONNAIRE: TaxonomyQuestion[] = [
  {
    id: "sc_ped",
    criterion: "substantial_contribution",
    text: "Erfüllt das Gebäude die Top-15%-PED-Schwelle bzw. EPC-Klasse A (Bestand) / NZEB −10 % (Neubau)?",
    mode: "auto",
  },
  {
    id: "dnsh_adapt",
    criterion: "dnsh_adaptation",
    text: "Sind wesentliche physische Klimarisiken bewertet und erforderliche Anpassungsmaßnahmen umgesetzt/geplant?",
    mode: "auto",
  },
  {
    id: "dnsh_water",
    criterion: "dnsh_water",
    text: "Erfüllen Wasserarmaturen die Anforderungen (Anhang I Anlage E, z. B. Durchflussbegrenzung)?",
    hint: "Nur bei Renovierung/Neubau relevant; Bestand ohne Eingriff: nicht anwendbar → Ja.",
    mode: "manual",
  },
  {
    id: "dnsh_circular",
    criterion: "dnsh_circular",
    text: "Werden bei Bau-/Abbrucharbeiten mind. 70 % der nicht gefährlichen Abfälle der Wiederverwendung/dem Recycling zugeführt?",
    mode: "manual",
  },
  {
    id: "dnsh_pollution",
    criterion: "dnsh_pollution",
    text: "Werden die Schadstoff-Grenzwerte eingehalten (u. a. keine Asbest-/F-Gase-Verstöße, Formaldehyd-Grenzwerte)?",
    mode: "manual",
  },
  {
    id: "dnsh_bio",
    criterion: "dnsh_biodiversity",
    text: "Liegt das Gebäude außerhalb von Schutzgebieten bzw. liegt eine UVP ohne erhebliche Beeinträchtigung vor?",
    mode: "manual",
  },
  {
    id: "min_safeguards",
    criterion: "minimum_safeguards",
    text: "Sind die Mindestschutz-Anforderungen erfüllt (OECD-Leitsätze, UN-Leitprinzipien, keine schwerwiegenden Verstöße)?",
    mode: "manual",
  },
];

export type TaxonomyAnswer = "ja" | "nein" | "nicht_anwendbar" | null;

export interface TaxonomyCheckResult {
  aligned: boolean;
  answered: number;
  total: number;
  failed: string[];
  open: string[];
  summary: string;
}

/** Bewertet den Fragebogen: aligned = alle Fragen ja/nicht_anwendbar. */
export function evaluateTaxonomyCheck(
  answers: Record<string, TaxonomyAnswer>,
): TaxonomyCheckResult {
  const failed: string[] = [];
  const open: string[] = [];
  let answered = 0;
  for (const q of TAXONOMY_QUESTIONNAIRE) {
    const a = answers[q.id] ?? null;
    if (a === null) {
      open.push(q.id);
      continue;
    }
    answered++;
    if (a === "nein") failed.push(q.id);
  }
  const aligned = failed.length === 0 && open.length === 0;
  return {
    aligned,
    answered,
    total: TAXONOMY_QUESTIONNAIRE.length,
    failed,
    open,
    summary: aligned
      ? "Alle Kriterien erfüllt bzw. nicht anwendbar – Taxonomie-Check bestanden (Screening-Niveau)."
      : failed.length > 0
        ? `${failed.length} Kriterium/Kriterien nicht erfüllt.`
        : `${open.length} Frage(n) offen – Check unvollständig.`,
  };
}
