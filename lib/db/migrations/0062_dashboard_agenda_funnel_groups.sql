ALTER TABLE "dashboard_bookmark_groups"
  ADD COLUMN IF NOT EXISTS "funnel_stage_group_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_bookmark_groups" ADD CONSTRAINT "dashboard_bookmark_groups_funnel_stage_group_id_funnel_stage_groups_id_fk"
 FOREIGN KEY ("funnel_stage_group_id") REFERENCES "public"."funnel_stage_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_bookmark_groups_team_funnel_group_uidx"
  ON "dashboard_bookmark_groups" USING btree ("team_id", "funnel_stage_group_id");
