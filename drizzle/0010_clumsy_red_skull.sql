CREATE TABLE "building_kpis_yearly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"co2_intensity_kg_m2a" double precision NOT NULL,
	"pathway_kg_m2a" double precision NOT NULL,
	"eui_kwh_m2a" double precision NOT NULL,
	"energy_pathway_kwh_m2a" double precision NOT NULL,
	"stranded" boolean NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "building_kpis_yearly" ADD CONSTRAINT "building_kpis_yearly_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "building_kpis_yearly_building_idx" ON "building_kpis_yearly" USING btree ("building_id","year");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status","created_at");