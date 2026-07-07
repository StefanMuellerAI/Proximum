CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"address" text,
	"extraction" jsonb NOT NULL,
	"normalized" jsonb NOT NULL,
	"selected_measures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"facade_result" jsonb,
	"facade_pano_date" text,
	"risk_result" jsonb,
	"cached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "buildings_user_id_idx" ON "buildings" USING btree ("user_id");