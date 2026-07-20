CREATE TABLE "api_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_hash" text NOT NULL,
	"roles" jsonb DEFAULT '["read"]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE INDEX "api_clients_org_idx" ON "api_clients" USING btree ("org_id");