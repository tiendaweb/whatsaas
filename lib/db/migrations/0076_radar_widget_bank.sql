ALTER TABLE "team_radar_widgets" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "team_radar_widgets" ADD COLUMN IF NOT EXISTS "archived_by" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_widgets" ADD CONSTRAINT "team_radar_widgets_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_radar_widgets_archived_idx" ON "team_radar_widgets" USING btree ("team_id","archived_at");
