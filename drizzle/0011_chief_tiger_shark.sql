CREATE TABLE "taxonomy_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"answers" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taxonomy_checks" ADD CONSTRAINT "taxonomy_checks_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taxonomy_checks_building_idx" ON "taxonomy_checks" USING btree ("building_id");