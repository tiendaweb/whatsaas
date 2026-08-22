DROP INDEX IF EXISTS "dashboard_bookmark_groups_team_funnel_group_uidx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_bookmark_groups_team_funnel_group_idx"
  ON "dashboard_bookmark_groups" USING btree ("team_id", "funnel_stage_group_id");
