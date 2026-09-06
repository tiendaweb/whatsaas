-- Producción OS: pedidos de trabajo dentro de Tareas OS.
--
-- Hasta acá el tipo de trabajo y su estado vivían en el título de la tarea
-- ("Demo tienda — Hernán · P1, esperando seña", "FALTA LOGO", "ARMABLE YA").
-- Quien produce no tenía dónde ver qué está pendiente, de qué tipo y en qué
-- estado; quien pide, no sabía si lo suyo se había tomado. Cuatro columnas
-- sobre la tarea, sin tabla nueva: la tarea sigue siendo la tarea.
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "work_kind" varchar(32);
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "work_status" varchar(24);
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "requested_by" integer REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "delivery_url" text;
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "blocked_reason" text;
CREATE INDEX IF NOT EXISTS "team_task_items_work_idx" ON "team_task_items" ("team_id", "work_status", "work_kind");

-- Relleno de lo que ya existe, leyendo lo que la gente escribió en los títulos.
-- Demos: tipo por el título, estado por marcadores y por la columna.
WITH demos AS (
  SELECT i.id, i.title, i.status, c.title AS col
    FROM team_task_items i
    JOIN team_task_projects p ON p.id = i.project_id
    JOIN team_task_workspaces w ON w.id = p.workspace_id
    JOIN team_task_columns c ON c.id = i.column_id
   WHERE w.name = 'Demos' AND i.work_kind IS NULL AND i.parent_task_id IS NULL
)
UPDATE team_task_items t
   SET work_kind = CASE
         WHEN d.title ~* 'tienda custom' THEN 'demo_tienda_custom'
         WHEN d.title ~* 'demo tienda' THEN 'demo_tienda_aapp'
         WHEN d.title ~* 'prosite|sitio profesional|mockup' THEN 'demo_prosite'
         WHEN d.title ~* 'html' THEN 'demo_html'
         WHEN d.title ~* 'plan de demos' THEN NULL
         ELSE 'demo_sitio_aapp' END,
       work_status = CASE
         WHEN d.status = 'done' OR d.col ~* 'hecho|entregad|listo|done' THEN 'entregado'
         WHEN d.title ~* 'falta|bloquea|esperando' THEN 'espera_cliente'
         WHEN d.col ~* 'curso|progreso' THEN 'en_curso'
         ELSE 'pedido' END,
       requested_by = COALESCE(t.requested_by, t.created_by)
  FROM demos d
 WHERE t.id = d.id AND NOT (d.title ~* 'plan de demos');

-- Workspace de producción: cambios, sitios nuevos y la tienda custom.
WITH prod AS (
  SELECT i.id, i.status, p.name AS proyecto, c.title AS col
    FROM team_task_items i
    JOIN team_task_projects p ON p.id = i.project_id
    JOIN team_task_workspaces w ON w.id = p.workspace_id
    JOIN team_task_columns c ON c.id = i.column_id
   WHERE w.name ~* 'producci' AND i.work_kind IS NULL AND i.parent_task_id IS NULL
)
UPDATE team_task_items t
   SET work_kind = CASE
         WHEN pr.proyecto ~* 'cambios' THEN 'cambio'
         WHEN pr.proyecto ~* 'tienda custom' THEN 'tienda_custom'
         WHEN pr.proyecto ~* 'sitios web' THEN 'sitio_aapp'
         ELSE NULL END,
       work_status = CASE
         WHEN pr.status = 'done' OR pr.col ~* 'hecho|entregad|listo|done' THEN 'entregado'
         WHEN pr.col ~* 'curso|progreso' THEN 'en_curso'
         ELSE 'pedido' END,
       requested_by = COALESCE(t.requested_by, t.created_by)
  FROM prod pr
 WHERE t.id = pr.id AND NOT (pr.proyecto ~* 'prompts');

-- Proyectos de clientes (los del Command Center y los "a medida"): producción en curso.
WITH cli AS (
  SELECT i.id, i.status, c.title AS col
    FROM team_task_items i
    JOIN team_task_projects p ON p.id = i.project_id
    JOIN team_task_workspaces w ON w.id = p.workspace_id
    JOIN team_task_columns c ON c.id = i.column_id
   WHERE (w.name = 'Clientes' OR w.name ~* 'clientes a medida') AND i.work_kind IS NULL AND i.parent_task_id IS NULL
)
UPDATE team_task_items t
   SET work_kind = 'desarrollo',
       work_status = CASE
         WHEN cl.status = 'done' OR cl.col ~* 'hecho|entregad|listo|done' THEN 'entregado'
         WHEN cl.col ~* 'por hacer|pendiente|backlog|ideas' THEN 'aceptado'
         ELSE 'en_curso' END,
       requested_by = COALESCE(t.requested_by, t.created_by)
 FROM cli cl
 WHERE t.id = cl.id;

-- El estado operativo es la fuente de verdad; mantener el estado genérico de
-- Tareas alineado evita que el mismo pedido figure abierto en un tablero y
-- terminado en el otro. `patchTaskItem` conserva esta regla hacia adelante.
UPDATE team_task_items
   SET status = CASE
         WHEN work_status IN ('entregado', 'descartado') THEN 'done'
         WHEN work_status IN ('en_curso', 'espera_cliente', 'cambios') THEN 'in_progress'
         ELSE 'open' END,
       completed_at = CASE
         WHEN work_status IN ('entregado', 'descartado') THEN COALESCE(completed_at, updated_at, now())
         ELSE NULL END
 WHERE work_kind IS NOT NULL AND work_status IS NOT NULL;
