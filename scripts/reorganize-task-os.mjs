import { writeFile } from 'node:fs/promises';
import postgres from 'postgres';

const TEAM_ID = 2;
const APPLY = process.argv.includes('--apply');
const BACKUP_PATH = '/tmp/whatspro-task-os-backup-20260821.json';

if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is required');

const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase('es');
const stableJson = (value) => JSON.stringify(value ?? null, Object.keys(value ?? {}).sort());
const trashTitles = new Set(['demo', 'demo de tarea', 'asdf', 'asdfadsf', 'nashjsd', 'hola', 'ideas rapidas']);

function isTrash(task) {
  const title = normalize(task.title);
  if (trashTitles.has(title)) return true;
  if (title === 'definir prioridades de la semana') {
    return normalize(task.notes) === 'elegir 3 objetivos comerciales y 1 objetivo personal.';
  }
  if (title === 'enviar propuesta a cliente vip') {
    return normalize(task.notes) === 'preparar propuesta breve y proxima accion.';
  }
  return false;
}

function fingerprint(task) {
  return JSON.stringify([
    normalize(task.title),
    String(task.notes ?? '').trim(),
    stableJson(task.label_ids),
    stableJson(task.checklist),
    task.status,
    task.completed_at?.toISOString?.() ?? task.completed_at ?? null,
    task.due_date?.toISOString?.() ?? task.due_date ?? null,
    task.start_date?.toISOString?.() ?? task.start_date ?? null,
    task.end_date?.toISOString?.() ?? task.end_date ?? null,
    task.parent_task_id ?? null,
    task.color ?? null,
    task.icon ?? null,
  ]);
}

async function snapshot() {
  const [workspaces, projects, columns, tasks, locations, relations, dependencies, media, comments, customers] = await Promise.all([
    sql`select * from team_task_workspaces where team_id = ${TEAM_ID} order by id`,
    sql`select * from team_task_projects where team_id = ${TEAM_ID} order by id`,
    sql`select * from team_task_columns where team_id = ${TEAM_ID} order by id`,
    sql`select * from team_task_items where team_id = ${TEAM_ID} order by id`,
    sql`select * from team_task_item_locations where team_id = ${TEAM_ID} order by id`,
    sql`select * from team_task_relations where team_id = ${TEAM_ID} order by id`,
    sql`select * from team_task_dependencies where team_id = ${TEAM_ID} order by id`,
    sql`select * from team_task_media where team_id = ${TEAM_ID} order by id`,
    sql`select * from team_task_comments where team_id = ${TEAM_ID} order by id`,
    sql`select * from team_customers where team_id = ${TEAM_ID} order by id`,
  ]);
  return { generatedAt: new Date().toISOString(), teamId: TEAM_ID, workspaces, projects, columns, tasks, locations, relations, dependencies, media, comments, customers };
}

function buildCleanupPlan(data) {
  const trash = data.tasks.filter(isTrash);
  const trashIds = new Set(trash.map((task) => task.id));
  const refCount = new Map(data.tasks.map((task) => [task.id, 0]));
  for (const location of data.locations) refCount.set(location.task_id, (refCount.get(location.task_id) ?? 0) + 1);
  for (const relation of data.relations) {
    if (relation.source_type === 'task') refCount.set(relation.source_id, (refCount.get(relation.source_id) ?? 0) + 1);
    if (relation.target_type === 'task') refCount.set(relation.target_id, (refCount.get(relation.target_id) ?? 0) + 1);
  }
  for (const comment of data.comments) refCount.set(comment.task_id, (refCount.get(comment.task_id) ?? 0) + 1);
  for (const item of data.media) if (item.owner_type === 'task') refCount.set(item.owner_id, (refCount.get(item.owner_id) ?? 0) + 1);
  for (const task of data.tasks) if (task.parent_task_id) refCount.set(task.parent_task_id, (refCount.get(task.parent_task_id) ?? 0) + 1);

  const byFingerprint = new Map();
  for (const task of data.tasks) {
    if (trashIds.has(task.id)) continue;
    const key = fingerprint(task);
    byFingerprint.set(key, [...(byFingerprint.get(key) ?? []), task]);
  }

  const duplicateMap = new Map();
  const groups = [];
  for (const group of byFingerprint.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => (refCount.get(b.id) ?? 0) - (refCount.get(a.id) ?? 0) || a.id - b.id);
    const [canonical, ...duplicates] = group;
    for (const duplicate of duplicates) duplicateMap.set(duplicate.id, canonical.id);
    groups.push({ title: canonical.title, canonicalId: canonical.id, duplicateIds: duplicates.map((item) => item.id) });
  }
  return { trash, trashIds, duplicateMap, groups };
}

async function ensureWorkspace(tx, name, order, color, icon) {
  const [existing] = await tx`select * from team_task_workspaces where team_id = ${TEAM_ID} and lower(trim(name)) = ${normalize(name)} limit 1`;
  if (existing) {
    await tx`update team_task_workspaces set name = ${name}, "order" = ${order}, color = ${color}, icon = ${icon}, updated_at = now() where id = ${existing.id}`;
    return existing.id;
  }
  const [created] = await tx`insert into team_task_workspaces (team_id, name, "order", color, icon) values (${TEAM_ID}, ${name}, ${order}, ${color}, ${icon}) returning id`;
  return created.id;
}

async function ensureColumn(tx, projectId, title) {
  const [existing] = await tx`select id from team_task_columns where team_id = ${TEAM_ID} and project_id = ${projectId} and lower(trim(title)) = ${normalize(title)} order by "order", id limit 1`;
  if (existing) return existing.id;
  const [max] = await tx`select coalesce(max("order"), -1) as value from team_task_columns where team_id = ${TEAM_ID} and project_id = ${projectId}`;
  const [created] = await tx`insert into team_task_columns (team_id, project_id, title, "order") values (${TEAM_ID}, ${projectId}, ${title}, ${Number(max.value) + 1}) returning id`;
  return created.id;
}

async function ensureProject(tx, workspaceId, name, order) {
  const [existing] = await tx`select id from team_task_projects where team_id = ${TEAM_ID} and workspace_id = ${workspaceId} and lower(trim(name)) = ${normalize(name)} order by id limit 1`;
  if (existing) {
    await tx`update team_task_projects set name = ${name}, "order" = ${order}, updated_at = now() where id = ${existing.id}`;
    return existing.id;
  }
  const [created] = await tx`insert into team_task_projects (team_id, workspace_id, name, "order", labels) values (${TEAM_ID}, ${workspaceId}, ${name}, ${order}, '[]'::jsonb) returning id`;
  await ensureColumn(tx, created.id, 'Pendiente');
  await ensureColumn(tx, created.id, 'En curso');
  await ensureColumn(tx, created.id, 'Finalizado');
  return created.id;
}

async function moveTask(tx, taskId, targetProjectId, targetColumnId) {
  const [task] = await tx`select project_id, "order" from team_task_items where team_id = ${TEAM_ID} and id = ${taskId}`;
  if (!task) return;
  await tx`update team_task_item_locations set is_primary = false, updated_at = now() where team_id = ${TEAM_ID} and task_id = ${taskId}`;
  await tx`
    insert into team_task_item_locations (task_id, team_id, project_id, column_id, "order", is_primary)
    values (${taskId}, ${TEAM_ID}, ${targetProjectId}, ${targetColumnId}, ${task.order}, true)
    on conflict (task_id, project_id) do update set column_id = excluded.column_id, "order" = excluded."order", is_primary = true, updated_at = now()
  `;
  if (task.project_id !== targetProjectId) {
    await tx`delete from team_task_item_locations where team_id = ${TEAM_ID} and task_id = ${taskId} and project_id = ${task.project_id}`;
  }
  await tx`update team_task_items set project_id = ${targetProjectId}, column_id = ${targetColumnId}, updated_at = now() where team_id = ${TEAM_ID} and id = ${taskId}`;
}

async function moveProjectTasks(tx, sourceProjectId, targetProjectId, sectionTitle) {
  const targetColumnId = await ensureColumn(tx, targetProjectId, sectionTitle);
  const tasks = await tx`select id from team_task_items where team_id = ${TEAM_ID} and project_id = ${sourceProjectId} order by "order", id`;
  for (const task of tasks) await moveTask(tx, task.id, targetProjectId, targetColumnId);
}

async function ensureCustomer(tx, preferredId, name) {
  if (preferredId) {
    const [preferred] = await tx`select id from team_customers where team_id = ${TEAM_ID} and id = ${preferredId}`;
    if (preferred) return preferred.id;
  }
  const [existing] = await tx`select id from team_customers where team_id = ${TEAM_ID} and lower(trim(name)) = ${normalize(name)} order by id limit 1`;
  if (existing) return existing.id;
  const [created] = await tx`insert into team_customers (team_id, name, source, status, notes) values (${TEAM_ID}, ${name}, 'manual', 'active', 'Creado al organizar Clientes en Tareas OS.') returning id`;
  return created.id;
}

async function ensureRelation(tx, sourceType, sourceId, targetType, targetId) {
  await tx`
    insert into team_task_relations (team_id, source_type, source_id, target_type, target_id, relation_type, metadata)
    values (${TEAM_ID}, ${sourceType}, ${sourceId}, ${targetType}, ${targetId}, 'related', ${tx.json({ source: 'task-os-reorganization' })})
    on conflict (team_id, source_type, source_id, target_type, target_id, relation_type) do nothing
  `;
}

async function applyCleanup(tx, plan, data) {
  for (const [duplicateId, canonicalId] of plan.duplicateMap) {
    await tx`
      insert into team_task_item_locations (task_id, team_id, project_id, column_id, "order", is_primary, created_at, updated_at)
      select ${canonicalId}, team_id, project_id, column_id, "order", false, created_at, now()
      from team_task_item_locations where team_id = ${TEAM_ID} and task_id = ${duplicateId}
      on conflict (task_id, project_id) do nothing
    `;
    await tx`update team_task_comments set task_id = ${canonicalId} where team_id = ${TEAM_ID} and task_id = ${duplicateId}`;
    await tx`update team_task_media set owner_id = ${canonicalId} where team_id = ${TEAM_ID} and owner_type = 'task' and owner_id = ${duplicateId}`;
    await tx`update team_task_items set parent_task_id = ${canonicalId} where team_id = ${TEAM_ID} and parent_task_id = ${duplicateId}`;

    const dependencies = data.dependencies.filter((item) => item.task_id === duplicateId || item.depends_on_task_id === duplicateId);
    for (const dependency of dependencies) {
      const taskId = plan.duplicateMap.get(dependency.task_id) ?? dependency.task_id;
      const dependsOnTaskId = plan.duplicateMap.get(dependency.depends_on_task_id) ?? dependency.depends_on_task_id;
      if (taskId !== dependsOnTaskId) {
        await tx`insert into team_task_dependencies (team_id, task_id, depends_on_task_id, created_by) values (${TEAM_ID}, ${taskId}, ${dependsOnTaskId}, ${dependency.created_by}) on conflict (task_id, depends_on_task_id) do nothing`;
      }
    }
    await tx`delete from team_task_dependencies where team_id = ${TEAM_ID} and (task_id = ${duplicateId} or depends_on_task_id = ${duplicateId})`;

    const relations = data.relations.filter((item) => (item.source_type === 'task' && item.source_id === duplicateId) || (item.target_type === 'task' && item.target_id === duplicateId));
    for (const relation of relations) {
      const sourceId = relation.source_type === 'task' ? plan.duplicateMap.get(relation.source_id) ?? relation.source_id : relation.source_id;
      const targetId = relation.target_type === 'task' ? plan.duplicateMap.get(relation.target_id) ?? relation.target_id : relation.target_id;
      if (!(relation.source_type === 'task' && relation.target_type === 'task' && sourceId === targetId)) {
        await tx`
          insert into team_task_relations (team_id, source_type, source_id, target_type, target_id, relation_type, metadata, created_by, created_at)
          values (${TEAM_ID}, ${relation.source_type}, ${sourceId}, ${relation.target_type}, ${targetId}, ${relation.relation_type}, ${tx.json(relation.metadata ?? {})}, ${relation.created_by}, ${relation.created_at})
          on conflict (team_id, source_type, source_id, target_type, target_id, relation_type) do nothing
        `;
      }
    }
    await tx`delete from team_task_relations where team_id = ${TEAM_ID} and ((source_type = 'task' and source_id = ${duplicateId}) or (target_type = 'task' and target_id = ${duplicateId}))`;
  }

  const deleteIds = [...plan.trashIds, ...plan.duplicateMap.keys()];
  if (deleteIds.length) await tx`delete from team_task_items where team_id = ${TEAM_ID} and id in ${tx(deleteIds)}`;
}

async function reorganize(tx, plan) {
  const [baseWorkspace] = await tx`select id from team_task_workspaces where team_id = ${TEAM_ID} order by id limit 1`;
  if (!baseWorkspace) throw new Error('No task workspace found');

  await tx`update team_task_workspaces set name = 'Equipo', "order" = 0, color = '#64748b', icon = 'Users', updated_at = now() where id = ${baseWorkspace.id}`;
  const workspaceIds = {
    Equipo: baseWorkspace.id,
    'AAPP SPACE': await ensureWorkspace(tx, 'AAPP SPACE', 1, '#10b981', 'Boxes'),
    Produccion: await ensureWorkspace(tx, 'Produccion', 2, '#3b82f6', 'Factory'),
    Seguimiento: await ensureWorkspace(tx, 'Seguimiento', 3, '#f59e0b', 'Radar'),
    Aplicaciones: await ensureWorkspace(tx, 'Aplicaciones', 4, '#8b5cf6', 'AppWindow'),
    Clientes: await ensureWorkspace(tx, 'Clientes', 5, '#ec4899', 'Contact'),
  };

  const placements = [
    [15, workspaceIds.Equipo, 'Auditoría', 0], [22, workspaceIds.Equipo, 'Casa', 1],
    [1, workspaceIds['AAPP SPACE'], 'Producto', 0], [67, workspaceIds['AAPP SPACE'], 'Ideas', 1], [17, workspaceIds['AAPP SPACE'], 'Empresas', 2],
    [2, workspaceIds.Produccion, 'WhatsPro', 0], [5, workspaceIds.Produccion, 'Entregas', 1],
    [280, workspaceIds.Seguimiento, 'Contactos', 0], [10, workspaceIds.Seguimiento, 'Publicidad', 1], [3, workspaceIds.Seguimiento, 'Campañas', 2], [12, workspaceIds.Seguimiento, 'Diseño', 3], [61, workspaceIds.Seguimiento, 'Noelia', 4], [281, workspaceIds.Seguimiento, 'Ventas IA', 5],
    [260, workspaceIds.Aplicaciones, 'Looppy', 0], [261, workspaceIds.Aplicaciones, 'Mara', 1], [263, workspaceIds.Aplicaciones, 'Alma Mía', 2], [264, workspaceIds.Aplicaciones, 'Flota', 3], [257, workspaceIds.Aplicaciones, 'Business Woman', 4], [19, workspaceIds.Aplicaciones, 'Catálogo', 5],
    [35, workspaceIds.Clientes, 'Distribuidora', 0], [27, workspaceIds.Clientes, 'Almamia', 1], [28, workspaceIds.Clientes, 'Kamal', 2], [30, workspaceIds.Clientes, 'Te Hago', 3], [29, workspaceIds.Clientes, 'Ofertas', 4], [258, workspaceIds.Clientes, 'Sale Market', 5],
  ];
  for (const [id, workspaceId, name, order] of placements) {
    await tx`update team_task_projects set workspace_id = ${workspaceId}, name = ${name}, "order" = ${order}, updated_at = now() where team_id = ${TEAM_ID} and id = ${id}`;
  }

  await moveProjectTasks(tx, 110, 35, 'Migración');
  await moveProjectTasks(tx, 111, 35, 'Pendientes');
  await moveProjectTasks(tx, 259, 260, 'Solicitudes');
  await moveProjectTasks(tx, 33, 260, 'Admin');

  const clientSpecs = [
    { name: 'Distribuidora', projectId: 35, customerId: 46, registry: ['emanuel - la distribuidora'] },
    { name: 'Almamia', projectId: 27, customerId: 112, registry: ['gonzalo - almamia'] },
    { name: 'Kamal', projectId: 28, customerId: 194, registry: ['matias - kamal express'] },
    { name: 'Te Hago', projectId: 30, customerId: 21, registry: [] },
    { name: 'Ofertas', projectId: 29, customerId: 3186, registry: [] },
    { name: 'Sale Market', projectId: 258, customerId: 17, registry: [] },
    { name: 'Suplementación', customerName: 'Suplementación Avanzada', registry: ['suplementacion avanzada'] },
    { name: 'Aguerre', customerName: 'Abogado Aguerre', registry: ['abogado aguerre'] },
    { name: 'Viajes', customerId: 3211, registry: ['maxi - travel'] },
    { name: 'Salvando Vidas', customerName: 'Salvando Vidas', registry: ['barbara - salvando vidas', 'salvando vidas'] },
    { name: 'Diana', customerId: 3214, registry: ['diana - az indumentaria', 'diana'] },
    { name: 'Atentamente', customerId: 3189, registry: ['luz genovese - atentamente psi'] },
    { name: 'Xylinos', customerId: 3216, registry: ['xynilos'] },
    { name: 'Paseos Devoto', customerId: 60, registry: ['pablo - paseos devoto'] },
    { name: 'Deco Hogar', customerId: 3215, registry: ['deco hogar'] },
  ];

  let clientOrder = 0;
  for (const spec of clientSpecs) {
    const projectId = spec.projectId ?? await ensureProject(tx, workspaceIds.Clientes, spec.name, clientOrder);
    await tx`update team_task_projects set workspace_id = ${workspaceIds.Clientes}, name = ${spec.name}, "order" = ${clientOrder++}, updated_at = now() where team_id = ${TEAM_ID} and id = ${projectId}`;
    const columnId = await ensureColumn(tx, projectId, 'Pendiente');
    if (spec.registry.length) {
      const registryTasks = await tx`select id, title from team_task_items where team_id = ${TEAM_ID} and project_id = 21`;
      for (const task of registryTasks) {
        if (spec.registry.includes(normalize(task.title))) await moveTask(tx, task.id, projectId, columnId);
      }
    }
    const customerId = await ensureCustomer(tx, spec.customerId, spec.customerName ?? spec.name);
    await ensureRelation(tx, 'project', projectId, 'customer', customerId);
    const clientTasks = await tx`select id from team_task_items where team_id = ${TEAM_ID} and project_id = ${projectId}`;
    for (const task of clientTasks) await ensureRelation(tx, 'task', task.id, 'customer', customerId);
  }

  await tx`delete from team_task_projects p where p.team_id = ${TEAM_ID} and not exists (select 1 from team_task_items t where t.team_id = ${TEAM_ID} and t.project_id = p.id)`;
  await tx`delete from team_task_workspaces w where w.team_id = ${TEAM_ID} and w.id not in ${tx(Object.values(workspaceIds))}`;

  await tx`
    delete from team_task_relations r
    where r.team_id = ${TEAM_ID} and (
      (r.source_type = 'task' and not exists (select 1 from team_task_items t where t.team_id = ${TEAM_ID} and t.id = r.source_id)) or
      (r.target_type = 'task' and not exists (select 1 from team_task_items t where t.team_id = ${TEAM_ID} and t.id = r.target_id)) or
      (r.source_type = 'project' and not exists (select 1 from team_task_projects p where p.team_id = ${TEAM_ID} and p.id = r.source_id)) or
      (r.target_type = 'project' and not exists (select 1 from team_task_projects p where p.team_id = ${TEAM_ID} and p.id = r.target_id))
    )
  `;

  const notes = [
    'Reorganización aplicada el 21/08/2026.',
    'Workspaces: Equipo, AAPP SPACE, Produccion, Seguimiento, Aplicaciones y Clientes.',
    `Eliminadas ${plan.trash.length} tareas de prueba y ${plan.duplicateMap.size} copias exactas.`,
    'Las relaciones, comentarios, adjuntos y ubicaciones de copias conservadas fueron migrados a su tarea canónica.',
    `Respaldo previo: ${BACKUP_PATH}`,
  ].join('\n');
  const [audit] = await tx`select id from team_task_items where team_id = ${TEAM_ID} and project_id = 15 and id = 864`;
  if (audit) {
    await tx`update team_task_items set title = 'Limpieza Tareas OS', notes = ${notes}, status = 'done', completed_at = now(), updated_at = now() where id = ${audit.id}`;
  } else {
    const columnId = await ensureColumn(tx, 15, 'Finalizado');
    const [created] = await tx`insert into team_task_items (team_id, project_id, column_id, title, notes, status, completed_at, "order") values (${TEAM_ID}, 15, ${columnId}, 'Limpieza Tareas OS', ${notes}, 'done', now(), 0) returning id`;
    await tx`insert into team_task_item_locations (task_id, team_id, project_id, column_id, "order", is_primary) values (${created.id}, ${TEAM_ID}, 15, ${columnId}, 0, true)`;
  }
}

const before = await snapshot();
const plan = buildCleanupPlan(before);
const report = {
  mode: APPLY ? 'apply' : 'dry-run',
  before: { workspaces: before.workspaces.length, projects: before.projects.length, tasks: before.tasks.length, relations: before.relations.length },
  trashTasks: plan.trash.length,
  duplicateTasks: plan.duplicateMap.size,
  duplicateGroups: plan.groups.map((group) => ({ title: group.title, copiesRemoved: group.duplicateIds.length })),
};

if (!APPLY) {
  console.log(JSON.stringify(report, null, 2));
  await sql.end();
  process.exit(0);
}

await writeFile(BACKUP_PATH, JSON.stringify(before, null, 2), { mode: 0o600 });
await sql.begin(async (tx) => {
  await applyCleanup(tx, plan, before);
  await reorganize(tx, plan);
});

const after = await snapshot();
console.log(JSON.stringify({
  ...report,
  backup: BACKUP_PATH,
  after: { workspaces: after.workspaces.length, projects: after.projects.length, tasks: after.tasks.length, relations: after.relations.length },
  workspaceNames: after.workspaces.map((workspace) => workspace.name),
  projects: after.projects.map((project) => project.name),
}, null, 2));
await sql.end();
