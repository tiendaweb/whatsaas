import 'server-only';

import { createHash } from 'crypto';
import { and, asc, desc, eq, inArray, isNotNull, isNull, max, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  contacts,
  teamCustomers,
  teamMembers,
  teamTaskColumns,
  teamTaskAiRuns,
  teamTaskItems,
  teamTaskProjects,
  teamTaskRelations,
  teamTaskWorkspaces,
  users,
} from '@/lib/db/schema';
import { analizarTextoConBanco } from '@/lib/gemini/key-bank';
import { createColumnInProject, createTaskInColumn, getProjectFirstColumn, insertRelation } from './task-os';
import {
  FAMILIA_LABEL,
  WORK_KIND_META,
  WORK_STATUS_META,
  checklistPorDefecto,
  esWorkKind,
  esWorkStatus,
  estadoTareaPara,
  familiaDe,
  puedeTransicionar,
  type Familia,
  type WorkKind,
  type WorkStatus,
} from '../shared/produccion';

export type ProductionParty = { type: 'contact' | 'customer'; id: number; name: string; chatId: number | null };

export type ProductionOrder = {
  id: number;
  title: string;
  notes: string;
  workKind: WorkKind;
  workStatus: WorkStatus;
  family: Familia;
  projectId: number;
  projectName: string;
  workspaceId: number | null;
  workspaceName: string | null;
  columnId: number;
  columnTitle: string;
  checklist: Array<{ id: string; text: string; completed: boolean }>;
  checklistDone: number;
  progress: number;
  dueDate: string | null;
  deliveryUrl: string | null;
  blockedReason: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  requestedBy: number | null;
  requestedByName: string | null;
  aiPrompt: string;
  aiReadyAt: string | null;
  lastAiRun: { status: 'completed' | 'blocked' | 'failed'; summary: string; connector: string; at: string } | null;
  parties: ProductionParty[];
  createdAt: string;
  updatedAt: string;
};

export type ProductionTarget = {
  workspaceId: number;
  workspaceName: string;
  projectId: number;
  projectName: string;
  columns: Array<{ id: number; title: string }>;
};

export type ProductionOsPayload = {
  orders: ProductionOrder[];
  members: Array<{ id: number; name: string; email: string }>;
  targets: ProductionTarget[];
  counts: {
    open: number;
    unassigned: number;
    waitingCustomer: number;
    due: number;
    byStatus: Record<WorkStatus, number>;
    byFamily: Record<Familia, number>;
  };
};

const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : null;
const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata, ipAddress: null });
  } catch (error) {
    // La auditoría nunca debe dejar el tablero a medias, pero el fallo sí queda
    // visible en logs para que no se convierta en una omisión silenciosa.
    console.error('[production-os/audit]', error);
  }
}

export async function loadProductionOs(teamId: number): Promise<ProductionOsPayload> {
  const rows = await db
    .select({
      task: teamTaskItems,
      projectName: teamTaskProjects.name,
      workspaceId: teamTaskProjects.workspaceId,
      workspaceName: teamTaskWorkspaces.name,
      columnTitle: teamTaskColumns.title,
    })
    .from(teamTaskItems)
    .innerJoin(teamTaskProjects, and(eq(teamTaskProjects.id, teamTaskItems.projectId), eq(teamTaskProjects.teamId, teamId)))
    .innerJoin(teamTaskColumns, and(eq(teamTaskColumns.id, teamTaskItems.columnId), eq(teamTaskColumns.teamId, teamId)))
    .leftJoin(teamTaskWorkspaces, and(eq(teamTaskWorkspaces.id, teamTaskProjects.workspaceId), eq(teamTaskWorkspaces.teamId, teamId)))
    .where(and(eq(teamTaskItems.teamId, teamId), isNotNull(teamTaskItems.workKind), isNotNull(teamTaskItems.workStatus), isNull(teamTaskItems.parentTaskId)))
    .orderBy(
      sql`case when ${teamTaskItems.workStatus} = 'pedido' then 0 when ${teamTaskItems.workStatus} = 'espera_cliente' then 1 when ${teamTaskItems.workStatus} = 'cambios' then 2 when ${teamTaskItems.workStatus} = 'en_curso' then 3 else 4 end`,
      asc(teamTaskItems.dueDate),
      desc(teamTaskItems.updatedAt),
    );

  const taskIds = rows.map((row) => row.task.id);
  const projectIds = Array.from(new Set(rows.map((row) => row.task.projectId)));
  const userIds = Array.from(new Set(rows.flatMap((row) => [row.task.assigneeId, row.task.requestedBy]).filter((id): id is number => Boolean(id))));

  const [personRows, memberRows, relationRows, targetRows, aiRunRows] = await Promise.all([
    userIds.length
      ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds))
      : Promise.resolve([]),
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(asc(users.name), asc(users.email)),
    taskIds.length
      ? db.select().from(teamTaskRelations).where(and(
          eq(teamTaskRelations.teamId, teamId),
          or(
            and(eq(teamTaskRelations.sourceType, 'task'), inArray(teamTaskRelations.sourceId, taskIds)),
            and(eq(teamTaskRelations.targetType, 'task'), inArray(teamTaskRelations.targetId, taskIds)),
            and(eq(teamTaskRelations.sourceType, 'project'), inArray(teamTaskRelations.sourceId, projectIds)),
            and(eq(teamTaskRelations.targetType, 'project'), inArray(teamTaskRelations.targetId, projectIds)),
          ),
        ))
      : Promise.resolve([]),
    db.select({
      workspaceId: teamTaskWorkspaces.id,
      workspaceName: teamTaskWorkspaces.name,
      projectId: teamTaskProjects.id,
      projectName: teamTaskProjects.name,
      columnId: teamTaskColumns.id,
      columnTitle: teamTaskColumns.title,
      columnOrder: teamTaskColumns.order,
    })
      .from(teamTaskProjects)
      .innerJoin(teamTaskWorkspaces, and(eq(teamTaskWorkspaces.id, teamTaskProjects.workspaceId), eq(teamTaskWorkspaces.teamId, teamId)))
      .innerJoin(teamTaskColumns, and(eq(teamTaskColumns.projectId, teamTaskProjects.id), eq(teamTaskColumns.teamId, teamId)))
      .where(eq(teamTaskProjects.teamId, teamId))
      .orderBy(asc(teamTaskWorkspaces.order), asc(teamTaskProjects.order), asc(teamTaskColumns.order)),
    taskIds.length
      ? db.select().from(teamTaskAiRuns).where(and(
          eq(teamTaskAiRuns.teamId, teamId),
          eq(teamTaskAiRuns.targetType, 'task'),
          inArray(teamTaskAiRuns.targetId, taskIds),
        )).orderBy(desc(teamTaskAiRuns.createdAt))
      : Promise.resolve([]),
  ]);

  const latestAiRun = new Map<number, (typeof aiRunRows)[number]>();
  for (const run of aiRunRows) if (!latestAiRun.has(run.targetId)) latestAiRun.set(run.targetId, run);

  const contactIds = new Set<number>();
  const customerIds = new Set<number>();
  for (const relation of relationRows) {
    if (relation.sourceType === 'contact') contactIds.add(relation.sourceId);
    if (relation.targetType === 'contact') contactIds.add(relation.targetId);
    if (relation.sourceType === 'customer') customerIds.add(relation.sourceId);
    if (relation.targetType === 'customer') customerIds.add(relation.targetId);
  }
  const [contactRows, customerRows] = await Promise.all([
    contactIds.size
      ? db.select({ id: contacts.id, name: contacts.name, chatId: contacts.chatId }).from(contacts).where(and(eq(contacts.teamId, teamId), inArray(contacts.id, [...contactIds])))
      : Promise.resolve([]),
    customerIds.size
      ? db.select({ id: teamCustomers.id, name: teamCustomers.name }).from(teamCustomers).where(and(eq(teamCustomers.teamId, teamId), inArray(teamCustomers.id, [...customerIds])))
      : Promise.resolve([]),
  ]);

  const people = new Map(personRows.map((row) => [row.id, row.name?.trim() || row.email]));
  const contactsById = new Map(contactRows.map((row) => [row.id, row]));
  const customersById = new Map(customerRows.map((row) => [row.id, row]));
  const relationsFor = (taskId: number, projectId: number): ProductionParty[] => {
    const out: ProductionParty[] = [];
    for (const relation of relationRows) {
      const belongs =
        (relation.sourceType === 'task' && relation.sourceId === taskId)
        || (relation.targetType === 'task' && relation.targetId === taskId)
        || (relation.sourceType === 'project' && relation.sourceId === projectId)
        || (relation.targetType === 'project' && relation.targetId === projectId);
      if (!belongs) continue;
      const other = relation.sourceType === 'task' || relation.sourceType === 'project'
        ? { type: relation.targetType, id: relation.targetId }
        : { type: relation.sourceType, id: relation.sourceId };
      if (other.type === 'contact') {
        const contact = contactsById.get(other.id);
        if (contact) out.push({ type: 'contact', id: contact.id, name: contact.name?.trim() || `Contacto #${contact.id}`, chatId: contact.chatId ?? null });
      }
      if (other.type === 'customer') {
        const customer = customersById.get(other.id);
        if (customer) out.push({ type: 'customer', id: customer.id, name: customer.name?.trim() || `Cliente #${customer.id}`, chatId: null });
      }
    }
    return out.filter((party, index, all) => all.findIndex((other) => other.type === party.type && other.id === party.id) === index);
  };

  const orders: ProductionOrder[] = rows.flatMap((row) => {
    if (!esWorkKind(row.task.workKind) || !esWorkStatus(row.task.workStatus)) return [];
    const checklist = Array.isArray(row.task.checklist)
      ? row.task.checklist.map((item) => ({ id: String(item.id), text: String(item.text), completed: Boolean(item.completed) }))
      : [];
    const checklistDone = checklist.filter((item) => item.completed).length;
    return [{
      id: row.task.id,
      title: row.task.title,
      notes: row.task.notes,
      workKind: row.task.workKind,
      workStatus: row.task.workStatus,
      family: familiaDe(row.task.workKind)!,
      projectId: row.task.projectId,
      projectName: row.projectName,
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      columnId: row.task.columnId,
      columnTitle: row.columnTitle,
      checklist,
      checklistDone,
      progress: checklist.length ? checklistDone / checklist.length : row.task.workStatus === 'entregado' ? 1 : 0,
      dueDate: iso(row.task.dueDate),
      deliveryUrl: row.task.deliveryUrl,
      blockedReason: row.task.blockedReason,
      assigneeId: row.task.assigneeId,
      assigneeName: row.task.assigneeId ? people.get(row.task.assigneeId) ?? null : null,
      requestedBy: row.task.requestedBy,
      requestedByName: row.task.requestedBy ? people.get(row.task.requestedBy) ?? null : null,
      aiPrompt: row.task.aiPrompt,
      aiReadyAt: iso(row.task.aiReadyAt),
      lastAiRun: latestAiRun.has(row.task.id) ? {
        status: latestAiRun.get(row.task.id)!.status,
        summary: latestAiRun.get(row.task.id)!.summary,
        connector: latestAiRun.get(row.task.id)!.connector,
        at: latestAiRun.get(row.task.id)!.createdAt.toISOString(),
      } : null,
      parties: relationsFor(row.task.id, row.task.projectId),
      createdAt: iso(row.task.createdAt)!,
      updatedAt: iso(row.task.updatedAt)!,
    }];
  });

  const targetsByProject = new Map<number, ProductionTarget>();
  for (const row of targetRows) {
    const relevant = /demo|producci|cliente/i.test(`${row.workspaceName} ${row.projectName}`);
    if (!relevant) continue;
    const target = targetsByProject.get(row.projectId) ?? {
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      projectId: row.projectId,
      projectName: row.projectName,
      columns: [],
    };
    target.columns.push({ id: row.columnId, title: row.columnTitle });
    targetsByProject.set(row.projectId, target);
  }

  const byStatus = Object.fromEntries(Object.keys(WORK_STATUS_META).map((status) => [status, 0])) as Record<WorkStatus, number>;
  const byFamily: Record<Familia, number> = { demo: 0, produccion: 0, cambio: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const order of orders) {
    byStatus[order.workStatus] += 1;
    byFamily[order.family] += 1;
  }
  return {
    orders,
    members: memberRows.map((row) => ({ id: row.id, name: row.name?.trim() || row.email, email: row.email })),
    targets: [...targetsByProject.values()],
    counts: {
      open: orders.filter((order) => WORK_STATUS_META[order.workStatus].abierto).length,
      unassigned: orders.filter((order) => WORK_STATUS_META[order.workStatus].abierto && !order.assigneeId).length,
      waitingCustomer: byStatus.espera_cliente,
      due: orders.filter((order) => WORK_STATUS_META[order.workStatus].abierto && order.dueDate && new Date(order.dueDate) < today).length,
      byStatus,
      byFamily,
    },
  };
}

async function ensureTarget(teamId: number, userId: number, kind: WorkKind) {
  const family = familiaDe(kind)!;
  const workspaces = await db.query.teamTaskWorkspaces.findMany({ where: eq(teamTaskWorkspaces.teamId, teamId), orderBy: (row, { asc: order }) => [order(row.order)] });
  const wantedWorkspace = family === 'demo' ? 'Demos' : '🏭 Producción';
  let workspace = workspaces.find((row) => family === 'demo' ? norm(row.name) === 'demos' : norm(row.name).includes('produccion'));
  if (!workspace) {
    [workspace] = await db.insert(teamTaskWorkspaces).values({ teamId, name: wantedWorkspace, order: family === 'demo' ? 50 : 45, icon: family === 'demo' ? 'globe' : 'factory', createdBy: userId }).returning();
  }
  const projectHint = family === 'cambio' ? 'cambios' : kind.includes('tienda_custom') ? 'tienda custom' : family === 'demo' ? 'demos' : 'produccion';
  const projects = await db.query.teamTaskProjects.findMany({ where: and(eq(teamTaskProjects.teamId, teamId), eq(teamTaskProjects.workspaceId, workspace.id)), orderBy: (row, { asc: order }) => [order(row.order)] });
  let project = projects.find((row) => norm(row.name).includes(projectHint));
  if (!project) {
    const [last] = await db.select({ order: max(teamTaskProjects.order) }).from(teamTaskProjects).where(and(eq(teamTaskProjects.teamId, teamId), eq(teamTaskProjects.workspaceId, workspace.id)));
    [project] = await db.insert(teamTaskProjects).values({
      teamId,
      workspaceId: workspace.id,
      name: family === 'demo' ? 'Demos' : family === 'cambio' ? 'Cambios' : FAMILIA_LABEL[family],
      order: (last?.order ?? -1) + 1,
      icon: family === 'demo' ? 'globe' : family === 'cambio' ? 'wrench' : 'factory',
      createdBy: userId,
    }).returning();
    for (const title of ['Por hacer', 'En curso', 'Hecho']) await createColumnInProject({ teamId, projectId: project.id, title });
  }
  const column = await getProjectFirstColumn(teamId, project.id);
  return { workspace, project, column };
}

export type CreateProductionOrderInput = {
  title: string;
  workKind: WorkKind;
  notes?: string;
  dueDate?: string | null;
  projectId?: number | null;
  columnId?: number | null;
  assigneeId?: number | null;
  contactId?: number | null;
  customerId?: number | null;
  chatId?: number | null;
  aiPrompt?: string;
  idempotencyKey?: string;
  source?: 'user' | 'connector' | 'command-center';
};

export async function createProductionOrder(teamId: number, userId: number, input: CreateProductionOrderInput) {
  if (input.idempotencyKey) {
    const previous = await db.query.activityLogs.findFirst({ where: and(
      eq(activityLogs.teamId, teamId),
      eq(activityLogs.action, 'PRODUCTION_OS_ORDER_CREATED'),
      sql`${activityLogs.metadata}->>'idempotencyKey' = ${input.idempotencyKey}`,
    ) });
    const previousTaskId = Number((previous?.metadata as Record<string, unknown> | undefined)?.taskId);
    if (previousTaskId) {
      const task = await db.query.teamTaskItems.findFirst({ where: and(eq(teamTaskItems.teamId, teamId), eq(teamTaskItems.id, previousTaskId)) });
      if (task) return { task, created: false, idempotent: true };
    }
  }

  let columnId = input.columnId ?? null;
  let projectId = input.projectId ?? null;
  if (columnId) {
    const column = await db.query.teamTaskColumns.findFirst({ where: and(eq(teamTaskColumns.teamId, teamId), eq(teamTaskColumns.id, columnId)) });
    if (!column || (projectId && column.projectId !== projectId)) throw new Error('La columna no pertenece al proyecto indicado.');
    projectId = column.projectId;
  } else if (projectId) {
    const project = await db.query.teamTaskProjects.findFirst({ where: and(eq(teamTaskProjects.teamId, teamId), eq(teamTaskProjects.id, projectId)) });
    if (!project) throw new Error('No existe el proyecto indicado.');
    columnId = (await getProjectFirstColumn(teamId, project.id)).id;
  } else {
    const target = await ensureTarget(teamId, userId, input.workKind);
    projectId = target.project.id;
    columnId = target.column.id;
  }

  if (input.assigneeId) {
    const member = await db.query.teamMembers.findFirst({ where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, input.assigneeId)) });
    if (!member) throw new Error('La persona asignada no pertenece al equipo.');
  }
  let contactId = input.contactId ?? null;
  if (input.chatId && !contactId) {
    const contact = await db.query.contacts.findFirst({ where: and(eq(contacts.teamId, teamId), eq(contacts.chatId, input.chatId)), columns: { id: true } });
    if (!contact) throw new Error('El chat no tiene un contacto guardado.');
    contactId = contact.id;
  }
  if (contactId) {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.teamId, teamId), eq(contacts.id, contactId)),
      columns: { id: true, chatId: true },
    });
    if (!contact) throw new Error('El contacto no pertenece al equipo.');
    if (input.chatId && contact.chatId !== input.chatId) throw new Error('El chat no corresponde al contacto indicado.');
  }
  if (input.customerId) {
    const customer = await db.query.teamCustomers.findFirst({
      where: and(eq(teamCustomers.teamId, teamId), eq(teamCustomers.id, input.customerId)),
      columns: { id: true },
    });
    if (!customer) throw new Error('El cliente no pertenece al equipo.');
  }

  const task = await createTaskInColumn({
    teamId,
    userId,
    columnId,
    title: input.title.slice(0, 500),
    notes: input.notes?.slice(0, 20000),
    dueDate: input.dueDate ?? null,
    checklist: checklistPorDefecto(input.workKind),
    aiPrompt: input.aiPrompt?.slice(0, 20000),
    assigneeId: input.assigneeId ?? null,
    workKind: input.workKind,
    workStatus: 'pedido',
    requestedBy: userId,
  });
  if (!task) throw new Error('No se pudo crear el pedido.');
  if (contactId) await insertRelation({ teamId, userId, sourceType: 'task', sourceId: task.id, targetType: 'contact', targetId: contactId, relationType: 'related', metadata: { source: `production-os:${input.source ?? 'user'}`, chatId: input.chatId ?? null } });
  if (input.customerId) await insertRelation({ teamId, userId, sourceType: 'task', sourceId: task.id, targetType: 'customer', targetId: input.customerId, relationType: 'related', metadata: { source: `production-os:${input.source ?? 'user'}` } });
  await audit(teamId, userId, 'PRODUCTION_OS_ORDER_CREATED', { taskId: task.id, workKind: input.workKind, source: input.source ?? 'user', idempotencyKey: input.idempotencyKey ?? null });
  return { task, created: true, idempotent: false };
}

export type UpdateProductionOrderInput = Partial<{
  workKind: WorkKind;
  workStatus: WorkStatus;
  title: string;
  notes: string;
  dueDate: string | null;
  assigneeId: number | null;
  deliveryUrl: string | null;
  blockedReason: string | null;
  checklist: Array<{ id: string; text: string; completed: boolean }>;
  aiPrompt: string;
  aiReadyAt: string | null;
}>;

export async function updateProductionOrder(teamId: number, userId: number, taskId: number, patch: UpdateProductionOrderInput, source: 'user' | 'connector' | 'command-center' = 'user') {
  const current = await db.query.teamTaskItems.findFirst({ where: and(eq(teamTaskItems.teamId, teamId), eq(teamTaskItems.id, taskId)) });
  if (!current || !esWorkKind(current.workKind) || !esWorkStatus(current.workStatus)) throw new Error('No existe el pedido de producción.');
  if (patch.workStatus && !puedeTransicionar(current.workStatus, patch.workStatus)) {
    throw new Error(`No se puede pasar de ${WORK_STATUS_META[current.workStatus].label} a ${WORK_STATUS_META[patch.workStatus].label}.`);
  }
  if (patch.assigneeId) {
    const member = await db.query.teamMembers.findFirst({ where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, patch.assigneeId)) });
    if (!member) throw new Error('La persona asignada no pertenece al equipo.');
  }
  const nextStatus = patch.workStatus ?? current.workStatus;
  const deliveryUrl = patch.deliveryUrl !== undefined ? patch.deliveryUrl : current.deliveryUrl;
  if (nextStatus === 'entregado' && !deliveryUrl?.trim()) throw new Error('Pegá el enlace de entrega antes de marcar el trabajo como entregado.');
  if (patch.aiReadyAt && !(patch.aiPrompt ?? current.aiPrompt).trim()) throw new Error('Agregá un prompt antes de dejar el trabajo para un conector.');
  const nextTaskStatus = patch.workStatus ? estadoTareaPara(patch.workStatus) : undefined;
  const [updated] = await db.update(teamTaskItems).set({
    ...(patch.workKind !== undefined && { workKind: patch.workKind }),
    ...(patch.workStatus !== undefined && { workStatus: patch.workStatus }),
    ...(patch.title !== undefined && { title: patch.title.trim().slice(0, 500) }),
    ...(patch.notes !== undefined && { notes: patch.notes.slice(0, 20000) }),
    ...(patch.dueDate !== undefined && { dueDate: patch.dueDate ? new Date(patch.dueDate) : null }),
    ...(patch.assigneeId !== undefined && { assigneeId: patch.assigneeId }),
    ...(patch.deliveryUrl !== undefined && { deliveryUrl: patch.deliveryUrl?.trim() || null }),
    ...(patch.blockedReason !== undefined && { blockedReason: patch.blockedReason?.trim().slice(0, 2000) || null }),
    ...(patch.checklist !== undefined && { checklist: patch.checklist }),
    ...(patch.aiPrompt !== undefined && { aiPrompt: patch.aiPrompt.slice(0, 20000) }),
    ...(patch.aiReadyAt !== undefined && { aiReadyAt: patch.aiReadyAt ? new Date(patch.aiReadyAt) : null }),
    ...(patch.workStatus !== undefined && patch.workStatus !== 'espera_cliente' && patch.blockedReason === undefined && { blockedReason: null }),
    ...(nextTaskStatus !== undefined && { status: nextTaskStatus, completedAt: nextTaskStatus === 'done' ? new Date() : null }),
    updatedAt: new Date(),
  }).where(and(eq(teamTaskItems.teamId, teamId), eq(teamTaskItems.id, taskId))).returning();
  if (!updated) throw new Error('No se pudo actualizar el pedido.');
  await audit(teamId, userId, 'PRODUCTION_OS_ORDER_UPDATED', {
    taskId,
    source,
    fromStatus: current.workStatus,
    toStatus: updated.workStatus,
    changed: Object.keys(patch),
  });
  return updated;
}

/**
 * Ejecuta el prompt de un pedido con el banco de Gemini y conserva el resultado
 * como una corrida auditable. No cambia el estado del pedido: la UI sólo avanza
 * al siguiente cuando esta función devuelve `ok: true`.
 */
export async function executeProductionPromptWithBank(teamId: number, userId: number, taskId: number) {
  const current = await db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.teamId, teamId), eq(teamTaskItems.id, taskId)),
  });
  if (!current || !esWorkKind(current.workKind) || !esWorkStatus(current.workStatus)) throw new Error('No existe el pedido de producción.');
  const prompt = current.aiPrompt.trim();
  if (prompt.length < 5) throw new Error('El prompt debe tener al menos 5 caracteres.');

  const checklist = Array.isArray(current.checklist)
    ? current.checklist.map((item) => `${item.completed ? '[x]' : '[ ]'} ${item.text}`).join('\n')
    : '';
  const promptSnapshot = [
    'PEDIDO DE PRODUCCIÓN',
    `Tarea #${current.id}: ${current.title}`,
    `Estado: ${WORK_STATUS_META[current.workStatus].label}`,
    current.notes.trim() ? `Contexto:\n${current.notes.trim()}` : '',
    checklist ? `Checklist:\n${checklist}` : '',
    `Instrucción:\n${prompt}`,
    'Respondé con el resultado concreto. Si esta tarea requiere herramientas o accesos externos que no tenés, indicá exactamente qué debe tomar un conector; no afirmes que ejecutaste acciones que no realizaste.',
  ].filter(Boolean).join('\n\n');
  const fingerprint = createHash('sha256').update(promptSnapshot).digest('hex');
  const outcome = await analizarTextoConBanco({ teamId, prompt: promptSnapshot });
  const completed = outcome.ok;
  const summary = (completed ? outcome.texto : outcome.error).trim().slice(0, 4000);
  const [run] = await db.insert(teamTaskAiRuns).values({
    teamId,
    targetType: 'task',
    targetId: taskId,
    phase: 'execute',
    status: completed ? 'completed' : 'failed',
    promptFingerprint: fingerprint,
    promptSnapshot,
    summary,
    connector: 'gemini-bank',
    metadata: completed
      ? { workKind: current.workKind, keyId: outcome.keyId, keyLabel: outcome.keyLabel, model: outcome.modelo }
      : { workKind: current.workKind, reintentable: outcome.reintentable },
    createdBy: userId,
  }).returning({ id: teamTaskAiRuns.id, createdAt: teamTaskAiRuns.createdAt });

  await audit(teamId, userId, completed ? 'PRODUCTION_OS_PROMPT_COMPLETED' : 'PRODUCTION_OS_PROMPT_FAILED', {
    taskId,
    runId: run.id,
    connector: 'gemini-bank',
    ...(completed ? { keyId: outcome.keyId, model: outcome.modelo } : { error: outcome.error.slice(0, 500) }),
  });

  return completed
    ? { ok: true as const, output: outcome.texto, connector: 'gemini-bank', model: outcome.modelo, runId: run.id }
    : { ok: false as const, error: outcome.error, reintentable: outcome.reintentable, runId: run.id };
}
