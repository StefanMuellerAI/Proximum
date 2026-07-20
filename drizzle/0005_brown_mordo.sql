CREATE TABLE "economic_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"building_id" uuid,
	"economic_unit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buildings" ADD COLUMN "economic_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "portfolio_members" ADD CONSTRAINT "portfolio_members_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_members" ADD CONSTRAINT "portfolio_members_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_members" ADD CONSTRAINT "portfolio_members_economic_unit_id_economic_units_id_fk" FOREIGN KEY ("economic_unit_id") REFERENCES "public"."economic_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "economic_units_org_id_idx" ON "economic_units" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "portfolio_members_portfolio_idx" ON "portfolio_members" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "portfolio_members_building_idx" ON "portfolio_members" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "portfolios_org_id_idx" ON "portfolios" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_economic_unit_id_economic_units_id_fk" FOREIGN KEY ("economic_unit_id") REFERENCES "public"."economic_units"("id") ON DELETE set null ON UPDATE no action;