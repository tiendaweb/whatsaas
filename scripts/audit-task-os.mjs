import postgres from 'postgres';

const TEAM_ID = 2;
if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is required');
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase('es');
const stableJson = (value) => JSON.stringify(value ?? null, Object.keys(value ?? {}).sort());

const [workspaces, projects, tasks, locations, relations, customers] = await Promise.all([
  sql`select id, name, "order" from team_task_workspaces where team_id = ${TEAM_ID} order by "order", id`,
  sql`
    select p.id, p.name, p.workspace_id, w.name as workspace_name,
      count(t.id)::int as task_count,
      count(t.id) filter (where t.status <> 'done')::int as open_count
    from team_task_projects p
    left join team_task_workspaces w on w.id = p.workspace_id
    left join team_task_items t on t.project_id = p.id and t.team_id = p.team_id
    where p.team_id = ${TEAM_ID}
    group by p.id, p.name, p.workspace_id, w.name, w."order", p."order"
    order by w."order", p."order", p.id
  `,
  sql`select * from team_task_items where team_id = ${TEAM_ID} order by id`,
  sql`select * from team_task_item_locations where team_id = ${TEAM_ID} order by id`,
  sql`select * from team_task_relations where team_id = ${TEAM_ID} order by id`,
  sql`select id, name, status from team_customers where team_id = ${TEAM_ID}`,
]);

const taskIds = new Set(tasks.map((task) => task.id));
const projectIds = new Set(projects.map((project) => project.id));
const customerIds = new Set(customers.map((customer) => customer.id));
const fingerprint = (task) => JSON.stringify([
  normalize(task.title), String(task.notes ?? '').trim(), stableJson(task.label_ids), stableJson(task.checklist), task.status,
  task.completed_at?.toISOString?.() ?? task.completed_at ?? null,
  task.due_date?.toISOString?.() ?? task.due_date ?? null,
  task.start_date?.toISOString?.() ?? task.start_date ?? null,
  task.end_date?.toISOString?.() ?? task.end_date ?? null,
  task.parent_task_id ?? null, task.color ?? null, task.icon ?? null,
]);
const groups = new Map();
for (const task of tasks) groups.set(fingerprint(task), [...(groups.get(fingerprint(task)) ?? []), task]);
const duplicates = [...groups.values()].filter((group) => group.length > 1).map((group) => ({ title: group[0].title, ids: group.map((task) => task.id) }));
const trash = tasks.filter((task) => /^(demo(?: de tarea)?|asdf(?:adsf)?|nashjsd|hola|ideas rapidas)$/i.test(task.title.trim()) || ['definir prioridades de la semana', 'enviar propuesta a cliente vip'].includes(normalize(task.title)));
const primaryByTask = new Map();
for (const location of locations) if (location.is_primary) primaryByTask.set(location.task_id, (primaryByTask.get(location.task_id) ?? 0) + 1);
const invalidLocations = locations.filter((location) => !taskIds.has(location.task_id) || !projectIds.has(location.project_id));
const danglingRelations = relations.filter((relation) => {
  const valid = (type, id) => type === 'task' ? taskIds.has(id) : type === 'project' ? projectIds.has(id) : type === 'customer' ? customerIds.has(id) : true;
  return !valid(relation.source_type, relation.source_id) || !valid(relation.target_type, relation.target_id);
});
const clients = projects.filter((project) => project.workspace_name === 'Clientes');
const projectCustomer = new Set(relations.filter((relation) => relation.source_type === 'project' && relation.target_type === 'customer').map((relation) => relation.source_id));
const taskCustomer = new Set(relations.filter((relation) => relation.source_type === 'task' && relation.target_type === 'customer').map((relation) => relation.source_id));
const clientsWithoutCustomer = clients.filter((project) => !projectCustomer.has(project.id));
const clientTaskIds = new Set(tasks.filter((task) => clients.some((project) => project.id === task.project_id)).map((task) => task.id));
const clientTasksWithoutCustomer = [...clientTaskIds].filter((id) => !taskCustomer.has(id));
const expectedWorkspaces = ['Equipo', 'AAPP SPACE', 'Produccion', 'Seguimiento', 'Aplicaciones', 'Clientes'];

const result = {
  ok: JSON.stringify(workspaces.map((item) => item.name)) === JSON.stringify(expectedWorkspaces)
    && duplicates.length === 0
    && trash.length === 0
    && invalidLocations.length === 0
    && danglingRelations.length === 0
    && tasks.every((task) => primaryByTask.get(task.id) === 1)
    && clients.every((project) => project.task_count > 0)
    && clientsWithoutCustomer.length === 0
    && clientTasksWithoutCustomer.length === 0,
  counts: { workspaces: workspaces.length, projects: projects.length, tasks: tasks.length, locations: locations.length, relations: relations.length },
  workspaces: workspaces.map((workspace) => workspace.name),
  byWorkspace: Object.fromEntries(workspaces.map((workspace) => [workspace.name, projects.filter((project) => project.workspace_id === workspace.id).map((project) => ({ name: project.name, tasks: project.task_count, open: project.open_count }))])),
  duplicateGroups: duplicates,
  trashTaskIds: trash.map((task) => task.id),
  tasksWithoutExactlyOnePrimaryLocation: tasks.filter((task) => primaryByTask.get(task.id) !== 1).map((task) => task.id),
  invalidLocationIds: invalidLocations.map((location) => location.id),
  danglingRelationIds: danglingRelations.map((relation) => relation.id),
  emptyClientProjects: clients.filter((project) => project.task_count === 0).map((project) => project.id),
  clientsWithoutCustomer: clientsWithoutCustomer.map((project) => project.id),
  clientTasksWithoutCustomer,
};

console.log(JSON.stringify(result, null, 2));
await sql.end();
if (!result.ok) process.exitCode = 1;
