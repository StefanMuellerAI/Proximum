CREATE TABLE "building_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"type" text NOT NULL,
	"zone" text,
	"area_m2" double precision,
	"orientation" text,
	"base_thickness_m" double precision,
	"base_lambda_wmk" double precision,
	"insulation_thickness_m" double precision,
	"insulation_lambda_wmk" double precision,
	"uw_window_w_m2k" double precision,
	"u_value_w_m2k" double precision,
	"source" text DEFAULT 'typologie' NOT NULL,
	"confidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "building_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"consumer_type" text NOT NULL,
	"carrier" text NOT NULL,
	"end_energy_kwh_m2a" double precision,
	"expenditure_factor" double precision,
	"distribution_loss_pct" double precision,
	"storage_loss_pct" double precision,
	"coverage_share" double precision,
	"supplier_id" uuid,
	"source" text DEFAULT 'ausweis' NOT NULL,
	"confidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumption_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"reporting_year" integer NOT NULL,
	"carrier" text NOT NULL,
	"amount_kwh" double precision NOT NULL,
	"cost_eur" double precision,
	"source" text DEFAULT 'manuell' NOT NULL,
	"rental_area_id" uuid,
	"review_status" text DEFAULT 'bestaetigt' NOT NULL,
	"dedupe_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "energy_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"carrier" text NOT NULL,
	"ef_series" jsonb,
	"pef_series" jsonb,
	"document_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measure_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"measure_id" text NOT NULL,
	"implementation_date" timestamp with time zone,
	"cost_override_eur" double precision,
	"cost_is_manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"tenant_name" text,
	"rental_area_m2" double precision,
	"common_area_m2" double precision,
	"owner_occupied" boolean DEFAULT false NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"portfolio_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "building_components" ADD CONSTRAINT "building_components_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_systems" ADD CONSTRAINT "building_systems_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_records" ADD CONSTRAINT "consumption_records_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_plans" ADD CONSTRAINT "measure_plans_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measure_plans" ADD CONSTRAINT "measure_plans_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_plan_id_measure_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."measure_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_areas" ADD CONSTRAINT "rental_areas_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "building_components_building_idx" ON "building_components" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "building_systems_building_idx" ON "building_systems" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "consumption_records_building_idx" ON "consumption_records" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "consumption_records_year_idx" ON "consumption_records" USING btree ("reporting_year");--> statement-breakpoint
CREATE INDEX "energy_suppliers_org_idx" ON "energy_suppliers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "measure_plans_scenario_idx" ON "measure_plans" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "measure_plans_building_idx" ON "measure_plans" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "measures_plan_idx" ON "measures" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "rental_areas_building_idx" ON "rental_areas" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "scenarios_org_idx" ON "scenarios" USING btree ("org_id");