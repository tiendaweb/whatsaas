-- Sectorizar los avisos: cada persona pertenece a un área y un aviso puede ir
-- dirigido a un área en vez de a todo el equipo.
ALTER TABLE "team_notification_prefs" ADD COLUMN IF NOT EXISTS "area" varchar(24);
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "area" varchar(24);
CREATE INDEX IF NOT EXISTS "team_notification_prefs_area_idx" ON "team_notification_prefs" ("team_id","area");
