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
} from "drizzle-orm/pg-core";
import type { EnergieausweisExtraction, NormalizedBuilding } from "@/lib/schema";
import type { FacadeResult } from "@/lib/facade";
import type { RiskResult } from "@/lib/risk";
import type { FootprintResult } from "@/lib/footprint";
import type { ReportConfig } from "@/lib/report-config";

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
