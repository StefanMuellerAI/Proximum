/**
 * Drizzle-Schema: Gebaeude-Persistenz (Neon Postgres).
 *
 * JSONB-lastiges Modell passend zur bestehenden zustandslosen Datenhaltung:
 * die Extraktion und die normalisierte Engine-Eingabe (inkl. User-Overrides)
 * werden als Ganzes gespeichert; Fassaden-/Risiko-Ergebnisse dienen als
 * API-Cache (ein bezahlter Bildabruf je Gebaeude).
 */
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  doublePrecision,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import type { EnergieausweisExtraction, NormalizedBuilding } from "@/lib/schema";
import type { FacadeResult } from "@/lib/facade";
import type { RiskResult } from "@/lib/risk";
import type { FootprintResult } from "@/lib/footprint";
import type { ReportConfig } from "@/lib/report-config";

/**
 * Wirtschaftseinheit (A7): fasst mehrere Gebaeude zusammen (z. B. ein
 * Ensemble mit mehreren Energieausweisen). Gebaeude referenzieren die WE
 * optional ueber buildings.economic_unit_id.
 */
export const economicUnits = pgTable(
  "economic_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("economic_units_org_id_idx").on(t.orgId)],
);

export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Clerk-User-ID des Erstellers. */
    userId: text("user_id").notNull(),
    /**
     * Clerk-Organization-ID (Mandant). null = persoenliches Gebaeude des
     * Users; gesetzt = gehoert der Organisation (alle Mitglieder sehen es).
     */
    orgId: text("org_id"),
    name: text("name"),
    address: text("address"),
    /** Optionale Wirtschaftseinheit (A7). */
    economicUnitId: uuid("economic_unit_id").references(() => economicUnits.id, {
      onDelete: "set null",
    }),

    extraction: jsonb("extraction").$type<EnergieausweisExtraction>().notNull(),
    /** Normalisierte Engine-Eingabe inkl. User-Overrides aus dem Review-Panel. */
    normalized: jsonb("normalized").$type<NormalizedBuilding>().notNull(),
    selectedMeasures: jsonb("selected_measures")
      .$type<string[]>()
      .notNull()
      .default([]),

    // API-Cache (Fassade/Risiko/Grundriss)
    facadeResult: jsonb("facade_result").$type<FacadeResult>(),
    facadePanoDate: text("facade_pano_date"),
    riskResult: jsonb("risk_result").$type<RiskResult>(),
    footprint: jsonb("footprint").$type<FootprintResult>(),
    cachedAt: timestamp("cached_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("buildings_user_id_idx").on(t.userId),
    index("buildings_org_id_idx").on(t.orgId),
  ],
);

export type BuildingRow = typeof buildings.$inferSelect;
export type NewBuildingRow = typeof buildings.$inferInsert;

/**
 * Portfolio (A7): freie n:m-Gruppierung von Gebaeuden und/oder
 * Wirtschaftseinheiten. Der Mandanten-Scope (userId/orgId) bleibt die harte
 * Grenze; ein Gebaeude kann in beliebig vielen Portfolios liegen.
 */
export const portfolios = pgTable(
  "portfolios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("portfolios_org_id_idx").on(t.orgId)],
);

/** Mitgliedschaft: genau eines von buildingId/economicUnitId ist gesetzt. */
export const portfolioMembers = pgTable(
  "portfolio_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    buildingId: uuid("building_id").references(() => buildings.id, {
      onDelete: "cascade",
    }),
    economicUnitId: uuid("economic_unit_id").references(() => economicUnits.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("portfolio_members_portfolio_idx").on(t.portfolioId),
    index("portfolio_members_building_idx").on(t.buildingId),
  ],
);

/**
 * Report-Konfiguration je Scope: "org:<orgId>" (Organisation) oder
 * "user:<userId>" (persoenlicher Bereich). Ein Datensatz je Scope.
 */
export const reportSettings = pgTable("report_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: text("scope").notNull().unique(),
  config: jsonb("config").$type<ReportConfig>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Gebaeude-Entwuerfe (A6): Zwischenzustand des Anlage-Wizards. Ein Entwurf
 * wird erst bei expliziter Bestaetigung in buildings ueberfuehrt; die
 * Multi-Upload-Session ueberlebt so Reload/Geraetewechsel.
 */
export const buildingDrafts = pgTable(
  "building_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    name: text("name"),
    extraction: jsonb("extraction").$type<EnergieausweisExtraction>().notNull(),
    normalized: jsonb("normalized").$type<NormalizedBuilding>().notNull(),
    /** Karten-Selektion aus Wizard-Schritt 3 (inkl. selected-Flags). */
    footprint: jsonb("footprint").$type<FootprintResult>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("building_drafts_org_id_idx").on(t.orgId)],
);

export type BuildingDraftRow = typeof buildingDrafts.$inferSelect;

// ---------------------------------------------------------------------------
// Datenmodell-Erweiterung (Spez. 2.10 + 2.13-2): relationale Entitaeten
// NEBEN dem bestehenden JSONB (Strangler-Prinzip). Jede fachliche Eingabe
// traegt Provenance: source (ausweis|vision|typologie|manuell|skalierung),
// confidence und updatedAt. Praezedenz: manuell > ausweis > vision >
// typologie; Re-Enrichment ueberschreibt manuelle Eingaben NIE automatisch.
// ---------------------------------------------------------------------------

/** Herkunft eines Datenpunkts (Provenance, 2.13-2). */
export type DataSource =
  | "ausweis"
  | "vision"
  | "typologie"
  | "manuell"
  | "skalierung"
  | "import";

/**
 * Bauteile (2.10-1): Grundlage des thermischen Modells (GAP-2).
 * U-Wert ist NIE direkt editierbar - nur ueber d und lambda; die Spalte
 * uValueW_m2K ist der berechnete (readonly) Wert.
 */
export const buildingComponents = pgTable(
  "building_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    /** Wand | Dach | Kellerdecke | oberste Geschossdecke | Fenster | Tuer */
    type: text("type")
      .$type<
        "wand" | "dach" | "kellerdecke" | "oberste_geschossdecke" | "fenster" | "tuer"
      >()
      .notNull(),
    /** Gebaeudebereich (oben/mitte/unten) - Teilsanierung untergliederbar. */
    zone: text("zone").$type<"oben" | "mitte" | "unten">(),
    areaM2: doublePrecision("area_m2"),
    /** Ausrichtung (N/O/S/W/horizontal) fuer solare Gewinne. */
    orientation: text("orientation"),
    /** Grundkonstruktion: Dicke (m) + Waermeleitfaehigkeit (W/mK). */
    baseThicknessM: doublePrecision("base_thickness_m"),
    baseLambdaWmK: doublePrecision("base_lambda_wmk"),
    /** Daemmung: Dicke (m) + lambda; neue Daemmung ERSETZT Bestand. */
    insulationThicknessM: doublePrecision("insulation_thickness_m"),
    insulationLambdaWmK: doublePrecision("insulation_lambda_wmk"),
    /** Fenster/Vorhangfassade: direkter Uw-Wert (kein Schichtaufbau). */
    uwWindowW_m2K: doublePrecision("uw_window_w_m2k"),
    /** Berechneter U-Wert (readonly, DIN EN ISO 6946). */
    uValueW_m2K: doublePrecision("u_value_w_m2k"),
    source: text("source").$type<DataSource>().notNull().default("typologie"),
    confidence: text("confidence").$type<"hoch" | "mittel" | "gering">(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("building_components_building_idx").on(t.buildingId)],
);

/**
 * Anlagentechnik-Energiepfade (2.10-2): Verbrauchertyp x Traeger mit
 * Aufwandszahl und Deckungsanteil (EN 15316 Level B).
 */
export const buildingSystems = pgTable(
  "building_systems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    consumerType: text("consumer_type")
      .$type<"heizung" | "warmwasser" | "lueftung" | "kuehlung" | "beleuchtung" | "sonstiges">()
      .notNull(),
    /** CarrierKey aus lib/data/reference.ts. */
    carrier: text("carrier").notNull(),
    endEnergyKwhM2a: doublePrecision("end_energy_kwh_m2a"),
    /** Erzeugeraufwandszahl e (Endenergie / Nutzenergie). */
    expenditureFactor: doublePrecision("expenditure_factor"),
    distributionLossPct: doublePrecision("distribution_loss_pct"),
    storageLossPct: doublePrecision("storage_loss_pct"),
    /** Deckungsanteil 0..1 (Mischsysteme: gewichtete Aufwandszahl). */
    coverageShare: doublePrecision("coverage_share"),
    supplierId: uuid("supplier_id"),
    source: text("source").$type<DataSource>().notNull().default("ausweis"),
    confidence: text("confidence").$type<"hoch" | "mittel" | "gering">(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("building_systems_building_idx").on(t.buildingId)],
);

/** Verbrauchsdaten (2.10-3): Zeitreihen je Berichtsjahr (GAP-7). */
export const consumptionRecords = pgTable(
  "consumption_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    /** Berichtsjahr der Zuordnung (CRREM-Hochrechnung). */
    reportingYear: integer("reporting_year").notNull(),
    carrier: text("carrier").notNull(),
    amountKwh: doublePrecision("amount_kwh").notNull(),
    /** Kosten (EUR, auch negativ - Gutschriften/Storno). */
    costEur: doublePrecision("cost_eur"),
    source: text("source")
      .$type<"rechnung" | "manuell" | "schaetzung">()
      .notNull()
      .default("manuell"),
    /** Mietflaechen-Zuordnung (Scope-Split). */
    rentalAreaId: uuid("rental_area_id"),
    /** Review-Status fuer den Rechnungs-Import (2.13-13). */
    reviewStatus: text("review_status")
      .$type<"bestaetigt" | "pruefung" | "verworfen">()
      .notNull()
      .default("bestaetigt"),
    /** Duplikat-/Storno-Erkennung: Hash ueber (Zeitraum, Traeger, Menge). */
    dedupeHash: text("dedupe_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("consumption_records_building_idx").on(t.buildingId),
    index("consumption_records_year_idx").on(t.reportingYear),
  ],
);

/**
 * Energielieferanten (2.10-4): eigene EF-/PEF-Zeitreihen bis 2050
 * (vollstaendig auszufuellen; Spez. 2.5 Regel 3).
 */
export const energySuppliers = pgTable(
  "energy_suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    name: text("name").notNull(),
    carrier: text("carrier").notNull(),
    /** EF-Zeitreihe kg CO2e/kWh: { "2024": 0.3, ..., "2050": 0.05 }. */
    efSeries: jsonb("ef_series").$type<Record<string, number>>(),
    /** PEF-Zeitreihe (nicht erneuerbarer Anteil). */
    pefSeries: jsonb("pef_series").$type<Record<string, number>>(),
    /** Beleg (z. B. Zertifikat) als Referenz. */
    documentUrl: text("document_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("energy_suppliers_org_idx").on(t.orgId)],
);

/** Szenarien (2.10-5): Portfolio-/Org-weite Planungsstaende (GAP-11). */
export const scenarios = pgTable(
  "scenarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    /** Optional an ein Portfolio gebunden (A7). */
    portfolioId: uuid("portfolio_id"),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scenarios_org_idx").on(t.orgId)],
);

/** Massnahmenplan: genau einer je Gebaeude und Szenario. */
export const measurePlans = pgTable(
  "measure_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scenarioId: uuid("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("measure_plans_scenario_idx").on(t.scenarioId),
    index("measure_plans_building_idx").on(t.buildingId),
  ],
);

/**
 * Massnahme mit Umsetzungsdatum (Zeitachse!): Wirkung ab Folgejahr
 * (2.13-10). type "exklusion" bildet Verkauf/Rueckbau ab (monatsanteilig).
 */
export const measures = pgTable(
  "measures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => measurePlans.id, { onDelete: "cascade" }),
    /** Massnahmen-ID aus dem Katalog (RENOVATION_MEASURES) oder "exklusion". */
    measureId: text("measure_id").notNull(),
    /** Umsetzungsdatum: Wirkung ab dem Folgejahr. */
    implementationDate: timestamp("implementation_date", { withTimezone: true }),
    /** Manuell ueberschriebene Kosten (EUR); null = Schaetzwert der Engine. */
    costOverrideEur: doublePrecision("cost_override_eur"),
    /** Kennzeichnung Schaetzwert vs. manuell (Spez. 2.9). */
    costIsManual: boolean("cost_is_manual").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("measures_plan_idx").on(t.planId)],
);

/**
 * Mietflaechen (2.10-6): MF + AF je Mieter fuer Scope-Split (GAP-12) und
 * CO2KostAufG. Flaechenumrechnung siehe lib/engine/areas.ts.
 */
export const rentalAreas = pgTable(
  "rental_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    tenantName: text("tenant_name"),
    /** Mietflaeche (m2). */
    rentalAreaM2: doublePrecision("rental_area_m2"),
    /** Allgemeinflaechen-Anteil (m2). */
    commonAreaM2: doublePrecision("common_area_m2"),
    /** true = vom Eigentuemer selbst genutzt. */
    ownerOccupied: boolean("owner_occupied").notNull().default(false),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rental_areas_building_idx").on(t.buildingId)],
);

// ---------------------------------------------------------------------------
// Assumption-Sets (2.13-4) + Regelwerk-Registry (2.13-5)
// ---------------------------------------------------------------------------

/**
 * Versioniertes Annahme-Paket {CRREM-Version, EF-Datenbank, Energiepreise,
 * CO2-Preispfad, BPI-Stand}. frozen = true: von Reports referenziert,
 * unveraenderlich (Abnahme 4.9).
 */
export const assumptionSets = pgTable(
  "assumption_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    name: text("name").notNull(),
    /** AssumptionSet aus lib/data/assumptions.ts. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    frozen: boolean("frozen").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assumption_sets_org_idx").on(t.orgId)],
);

/**
 * Regelwerk-Registry: Effizienzklassen, PEF, EF, CO2-Preise, Foerderquoten
 * als DATEN mit Gueltigkeitszeitraeumen. Gesetzesaenderungen (z. B. das
 * ausstehende NWG-Stufenmodell, EPBD-Klassenskala ~2030) werden Datenpflege
 * statt Deployment; jeder Ausweis wird nach dem Recht seines
 * Ausstellungsdatums interpretiert.
 */
export const regulationVersions = pgTable(
  "regulation_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind")
      .$type<
        "effizienzklassen" | "pef" | "emissionsfaktoren" | "co2preise" | "foerderquoten" | "co2kostaufg"
      >()
      .notNull(),
    /** Land (ISO-2) fuer landesspezifische Regelwerke. */
    country: text("country").notNull().default("DE"),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    source: text("source"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("regulation_versions_kind_idx").on(t.kind)],
);

// ---------------------------------------------------------------------------
// Job-Queue + KPI-Materialisierung (2.13-12d): eventgetrieben ueber den
// Recompute-DAG; noetig ab ~100 Gebaeuden.
// ---------------------------------------------------------------------------

/** DB-basierte Job-Queue (einfach, transaktional, ohne Zusatz-Infra). */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type")
      .$type<"materialize_kpis" | "recompute_portfolio">()
      .notNull(),
    /** z. B. { buildingId } */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status")
      .$type<"pending" | "running" | "done" | "error">()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_status_idx").on(t.status, t.createdAt)],
);

/**
 * Materialisierte Jahres-KPIs je Gebaeude: entkoppelt Listen-/Portfolio-
 * Abfragen vom Rechenkern (Grenze liegt danach bei Postgres, 100k+
 * Gebaeude unkritisch).
 */
export const buildingKpisYearly = pgTable(
  "building_kpis_yearly",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    co2IntensityKgM2a: doublePrecision("co2_intensity_kg_m2a").notNull(),
    pathwayKgM2a: doublePrecision("pathway_kg_m2a").notNull(),
    euiKwhM2a: doublePrecision("eui_kwh_m2a").notNull(),
    energyPathwayKwhM2a: doublePrecision("energy_pathway_kwh_m2a").notNull(),
    stranded: boolean("stranded").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("building_kpis_yearly_building_idx").on(t.buildingId, t.year),
  ],
);

// ---------------------------------------------------------------------------
// Audit-Schicht (2.13-6): Append-only-Log + Report-Snapshots mit Hash
// ---------------------------------------------------------------------------

/** Append-only Audit-Log: wer/was/wann/alt/neu. Niemals updaten/loeschen. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").$type<"create" | "update" | "delete">().notNull(),
    /** Zustand vor der Aenderung (null bei create). */
    before: jsonb("before").$type<Record<string, unknown>>(),
    /** Zustand nach der Aenderung (null bei delete). */
    after: jsonb("after").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entity, t.entityId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

/**
 * Report-Snapshot: eingefrorene Momentaufnahme (Eingangsdaten + Ergebnis +
 * Assumption-Set) mit Hash ueber die Eingangsdaten. Ein abgeschlossener
 * Report liefert nach Faktor-/Preisaenderungen bit-identische Werte
 * (Abnahme 4.9); der Hash verifiziert das automatisiert.
 */
export const reportSnapshots = pgTable(
  "report_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    assumptionSetId: uuid("assumption_set_id"),
    /** SHA-256 ueber stableStringify(Eingangsdaten + Assumption-Set). */
    inputHash: text("input_hash").notNull(),
    /** Eingefrorene Eingangsdaten + Analyse-Ergebnisse. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("report_snapshots_building_idx").on(t.buildingId)],
);

/**
 * API-Clients (GAP-14): OAuth-2.0-Client-Credentials fuer die oeffentliche
 * API. Das Secret wird nur als SHA-256-Hash gespeichert; Rollen READ/WRITE.
 */
export const apiClients = pgTable(
  "api_clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    name: text("name").notNull(),
    clientId: text("client_id").notNull().unique(),
    clientSecretHash: text("client_secret_hash").notNull(),
    roles: jsonb("roles").$type<("read" | "write")[]>().notNull().default(["read"]),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_clients_org_idx").on(t.orgId)],
);

/**
 * Taxonomie-Checks (GAP-13): Fragebogen-Antworten + Ergebnis als
 * UNVERAENDERLICHE Momentaufnahme (completed = eingefroren).
 */
export const taxonomyChecks = pgTable(
  "taxonomy_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    /** Antworten je Frage-ID (ja/nein/nicht_anwendbar/null). */
    answers: jsonb("answers").$type<Record<string, string | null>>().notNull(),
    /** Bewertung + eingefrorene Screening-Daten bei Abschluss. */
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    /** true = abgeschlossen und unveraenderlich. */
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("taxonomy_checks_building_idx").on(t.buildingId)],
);

// ---------------------------------------------------------------------------
// Metering-Events (2.13-13): Produktnutzung ab Tag 1 messbar machen
// ---------------------------------------------------------------------------

/** Gemessene Produkt-Ereignisse (fuer Abrechnung/Adoption, append-only). */
export type MeteringEventType =
  | "document_processed" // Ausweis/Rechnung durch Extraktion gelaufen
  | "building_created"
  | "buildings_imported" // Bulk-Import (payload.count)
  | "report_generated"
  | "api_call";

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Ereignistyp (MeteringEventType). */
    type: text("type").$type<MeteringEventType>().notNull(),
    userId: text("user_id").notNull(),
    orgId: text("org_id"),
    /** Optionaler Gebaeude-Bezug. */
    buildingId: uuid("building_id"),
    /** Freie Zusatzdaten (z. B. { count: 120 } beim Bulk-Import). */
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("events_type_idx").on(t.type),
    index("events_org_id_idx").on(t.orgId),
    index("events_created_at_idx").on(t.createdAt),
  ],
);

export type EventRow = typeof events.$inferSelect;
