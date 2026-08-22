-- Create funnel_stage_groups table
CREATE TABLE IF NOT EXISTS "funnel_stage_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "description" varchar(300),
  "order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Add group_id column to funnel_stages (nullable for backward compatibility)
ALTER TABLE "funnel_stages"
  ADD COLUMN IF NOT EXISTS "group_id" integer REFERENCES "funnel_stage_groups"("id") ON DELETE SET NULL;
