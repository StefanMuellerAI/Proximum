CREATE TABLE "assumption_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"country" text DEFAULT 'DE' NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"source" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "assumption_sets_org_idx" ON "assumption_sets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "regulation_versions_kind_idx" ON "regulation_versions" USING btree ("kind");