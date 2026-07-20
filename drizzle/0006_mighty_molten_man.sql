CREATE TABLE "building_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"name" text,
	"extraction" jsonb NOT NULL,
	"normalized" jsonb NOT NULL,
	"footprint" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "building_drafts_org_id_idx" ON "building_drafts" USING btree ("org_id");