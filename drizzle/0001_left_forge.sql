ALTER TABLE "buildings" ADD COLUMN "org_id" text;--> statement-breakpoint
CREATE INDEX "buildings_org_id_idx" ON "buildings" USING btree ("org_id");