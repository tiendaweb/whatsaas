ALTER TABLE "team_sites"
  ADD COLUMN IF NOT EXISTS "custom_domain" varchar(253);

ALTER TABLE "team_sites"
  ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "team_sites_custom_domain_uidx"
  ON "team_sites" ("custom_domain")
  WHERE "custom_domain" IS NOT NULL;
