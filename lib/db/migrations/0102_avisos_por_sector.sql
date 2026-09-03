-- El sector de los avisos pasa a ser el Departamento del equipo, que ya es el
-- sector operativo (los contactos y los chats se asignan ahí). El `area` suelto
-- de `team_notification_prefs` era un segundo concepto de sector en paralelo:
-- dos listas que nadie mantiene sincronizadas.

-- 1. Cada área que alguien tenía cargada se convierte en un departamento real.
INSERT INTO "departments" ("team_id", "name")
SELECT DISTINCT p."team_id", m.nombre
FROM "team_notification_prefs" p
JOIN (VALUES
  ('ventas', 'Ventas y Clientes'),
  ('produccion', 'Producción y Desarrollo'),
  ('administracion', 'Administración'),
  ('direccion', 'Dirección')
) AS m(area, nombre) ON m.area = p."area"
WHERE p."area" IS NOT NULL
ON CONFLICT ("team_id", "name") DO NOTHING;

-- 2. Y la persona queda como miembro de ese departamento.
INSERT INTO "department_members" ("department_id", "user_id")
SELECT d."id", p."user_id"
FROM "team_notification_prefs" p
JOIN (VALUES
  ('ventas', 'Ventas y Clientes'),
  ('produccion', 'Producción y Desarrollo'),
  ('administracion', 'Administración'),
  ('direccion', 'Dirección')
) AS m(area, nombre) ON m.area = p."area"
JOIN "departments" d ON d."team_id" = p."team_id" AND d."name" = m.nombre
WHERE p."area" IS NOT NULL
ON CONFLICT ("department_id", "user_id") DO NOTHING;

-- 3. Se va el área y entra el alcance de los avisos de chat.
DROP INDEX IF EXISTS "team_notification_prefs_area_idx";
ALTER TABLE "team_notification_prefs" DROP COLUMN IF EXISTS "area";
ALTER TABLE "team_notification_prefs" ADD COLUMN IF NOT EXISTS "chat_alerts" varchar(12) NOT NULL DEFAULT 'sector';

ALTER TABLE "team_notifications" DROP COLUMN IF EXISTS "area";
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES "departments"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "team_notifications_department_idx" ON "team_notifications" ("team_id", "department_id");
