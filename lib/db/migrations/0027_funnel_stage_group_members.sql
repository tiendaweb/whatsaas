-- Junction table: stages can belong to multiple groups with independent order
CREATE TABLE IF NOT EXISTS "funnel_stage_group_members" (
  "id" serial PRIMARY KEY NOT NULL,
  "group_id" integer NOT NULL REFERENCES "funnel_stage_groups"("id") ON DELETE CASCADE,
  "stage_id" integer NOT NULL REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "order" integer NOT NULL DEFAULT 0,
  UNIQUE ("group_id", "stage_id")
);
