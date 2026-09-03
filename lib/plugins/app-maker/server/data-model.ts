import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  teamAppMakerRecordLinks,
  teamAppMakerRecords,
} from '@/lib/db/schema';
import { getReadOnlyResource, readOnlyResourceMap } from '@/lib/readonly-api/catalog';
import { hasPermission, type MemberPermissions } from '@/lib/permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import type {
  AppAudience,
  AppDataSourceDefinition,
  AppEntityDefinition,
  AppEntityFieldDefinition,
  AppMakerRecord,
  AppRelationDefinition,
  ApplicationDefinition,
} from '../shared/contract';
import { appMakerResourcePolicy } from './resource-permissions';
import { canReadAppMakerChatRecord } from './chat-visibility';

export type AppMakerDataContext = {
  teamId: number;
  userId: number;
  role: string;
  permissions?: MemberPermissions | null;
};

export type AppMakerEntityOperation = 'read' | 'create' | 'update' | 'delete';

type StoredRecord = typeof teamAppMakerRecords.$inferSelect;
type RecordData = Record<string, unknown>;

const COMPUTED_FIELD_TYPES = new Set(['formula', 'lookup', 'rollup']);
const ATTACHMENT_FIELD_TYPES = new Set(['file', 'image', 'audio', 'video']);

export function effectiveAppMakerDefinition(record: AppMakerRecord, draft = false) {
  return draft ? record.definition : (record.publishedDefinition ?? record.definition);
}

export function findAppMakerEntity(definition: ApplicationDefinition, entityKey: string) {
  return definition.dataModel.entities.find((entity) => entity.key === entityKey) ?? null;
}

export function canUseAudience(audience: AppAudience | undefined, context: Pick<AppMakerDataContext, 'userId' | 'role'>) {
  if (!audience) return true;
  if (audience.roles?.length && !audience.roles.includes(context.role as 'owner' | 'admin' | 'agent')) return false;
  if (audience.userIds?.length && !audience.userIds.includes(context.userId)) return false;
  return true;
}

export function assertEntityOperation(
  entity: AppEntityDefinition,
  operation: AppMakerEntityOperation,
  context: AppMakerDataContext,
) {
  if (!canUseAudience(entity.permissions[operation], context)) throw new Error(`entity_${operation}_forbidden`);
}

function canReadField(field: AppEntityFieldDefinition, context: AppMakerDataContext) {
  return !field.hidden && !field.sensitive && canUseAudience(field.permissions.read, context);
}

function canWriteField(field: AppEntityFieldDefinition, context: AppMakerDataContext) {
  return !field.hidden && !COMPUTED_FIELD_TYPES.has(field.type) && field.type !== 'relation' && canUseAudience(field.permissions.write, context);
}

function normalizedScalar(field: AppEntityFieldDefinition, value: unknown) {
  if (value === null || value === undefined || value === '') return value === '' && field.type === 'text' ? '' : null;
  if (['number', 'currency', 'percent', 'duration'].includes(field.type)) {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) throw new Error(`invalid_field:${field.key}`);
    return number;
  }
  if (field.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    throw new Error(`invalid_field:${field.key}`);
  }
  if (field.type === 'multi-select') {
    const values = Array.isArray(value) ? value : [value];
    return values.map(String).slice(0, 100);
  }
  if (ATTACHMENT_FIELD_TYPES.has(field.type)) {
    const values = Array.isArray(value) ? value : [value];
    const ids = values.map(Number).filter((item) => Number.isInteger(item) && item > 0);
    return ids.slice(0, 50);
  }
  if (['date', 'datetime'].includes(field.type)) {
    const text = String(value);
    if (!Number.isFinite(Date.parse(text))) throw new Error(`invalid_field:${field.key}`);
    return text;
  }
  const text = String(value);
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error(`invalid_field:${field.key}`);
  if (field.type === 'url') {
    try { new URL(text); } catch { throw new Error(`invalid_field:${field.key}`); }
  }
  if (field.type === 'select' || field.type === 'status') {
    const allowed = field.options?.map((option) => String(option.value));
    if (allowed?.length && !allowed.includes(text)) throw new Error(`invalid_field:${field.key}`);
  }
  return text.slice(0, field.type === 'long-text' || field.type === 'rich-text' ? 100_000 : 2_000);
}

async function normalizeRecordInput(input: {
  app: AppMakerRecord;
  entity: AppEntityDefinition;
  context: AppMakerDataContext;
  values: RecordData;
  operation: 'create' | 'update';
  current?: RecordData;
  currentRecordId?: number;
}) {
  const normalized: RecordData = input.operation === 'update' ? { ...(input.current ?? {}) } : {};
  const known = new Map(input.entity.fields.map((field) => [field.key, field]));
  for (const key of Object.keys(input.values)) {
    const field = known.get(key);
    if (!field || !canWriteField(field, input.context)) throw new Error(`field_write_forbidden:${key}`);
    const value = normalizedScalar(field, input.values[key]);
    if (value === null) delete normalized[key];
    else normalized[key] = value;
  }
  if (input.operation === 'create') {
    for (const field of input.entity.fields) {
      if (normalized[field.key] === undefined && field.defaultValue !== undefined && canWriteField(field, input.context)) {
        normalized[field.key] = normalizedScalar(field, field.defaultValue);
      }
    }
  }
  for (const field of input.entity.fields) {
    const value = normalized[field.key];
    if (field.required && (value === undefined || value === null || value === '')) throw new Error(`required_field:${field.key}`);
    if (value === undefined || value === null) continue;
    const measurable = typeof value === 'number' ? value : String(value).length;
    if (field.validation?.min !== undefined && measurable < field.validation.min) throw new Error(`field_too_small:${field.key}`);
    if (field.validation?.max !== undefined && measurable > field.validation.max) throw new Error(`field_too_large:${field.key}`);
    if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(String(value))) throw new Error(`field_pattern:${field.key}`);
    if (field.unique) {
      const duplicate = await db
        .select({ id: teamAppMakerRecords.id })
        .from(teamAppMakerRecords)
        .where(and(
          eq(teamAppMakerRecords.teamId, input.context.teamId),
          eq(teamAppMakerRecords.appId, input.app.id),
          eq(teamAppMakerRecords.entityKey, input.entity.key),
          sql`${teamAppMakerRecords.data} ->> ${field.key} = ${String(value)}`,
        ))
        .limit(2);
      if (duplicate.some((row) => row.id !== input.currentRecordId)) throw new Error(`field_not_unique:${field.key}`);
    }
  }
  return normalized;
}

function publicRecord(row: StoredRecord, entity: AppEntityDefinition, context: AppMakerDataContext): RecordData {
  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as RecordData : {};
  const visible = Object.fromEntries(entity.fields.filter((field) => canReadField(field, context)).map((field) => [field.key, data[field.key]]));
  return {
    id: row.id,
    entityKey: row.entityKey,
    ...visible,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function matchesFilter(row: RecordData, filter: NonNullable<AppDataSourceDefinition['filters']>[number]) {
  const actual = row[filter.field];
  const expected = filter.value;
  switch (filter.operator) {
    case 'neq': return String(actual ?? '') !== String(expected ?? '');
    case 'contains': return String(actual ?? '').toLocaleLowerCase().includes(String(expected ?? '').toLocaleLowerCase());
    case 'starts-with': return String(actual ?? '').toLocaleLowerCase().startsWith(String(expected ?? '').toLocaleLowerCase());
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'in': return String(expected ?? '').split(',').map((item) => item.trim()).includes(String(actual ?? ''));
    case 'is-empty': return actual === undefined || actual === null || actual === '';
    default: return String(actual ?? '') === String(expected ?? '');
  }
}

async function assertSystemResourceAccess(resourceKey: string, context: AppMakerDataContext) {
  const policy = appMakerResourcePolicy(resourceKey);
  if (!policy || !hasPermission(context.role, context.permissions, policy.permission)) throw new Error('resource_read_forbidden');
  if (policy.pluginId) {
    const active = await resolveActivePluginsForTeam(context.teamId, context.userId);
    if (!active.some((plugin) => plugin.pluginId === policy.pluginId)) throw new Error('resource_plugin_unavailable');
  }
}

function sortRows(rows: RecordData[], sort: AppDataSourceDefinition['sort']) {
  if (!sort?.length) return rows;
  return [...rows].sort((left, right) => {
    for (const item of sort) {
      const a = left[item.field];
      const b = right[item.field];
      const comparison = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });
      if (comparison) return item.direction === 'desc' ? -comparison : comparison;
    }
    return 0;
  });
}

function applyComputedFields(row: RecordData, entity: AppEntityDefinition) {
  const next = { ...row };
  for (const field of entity.fields) {
    if (field.type === 'formula' && field.computed?.expression) {
      next[field.key] = field.computed.expression.replace(/\{\{([a-z0-9-]+)\}\}/gi, (_match, key: string) => String(next[key] ?? ''));
    }
    if (field.type === 'lookup' && field.computed?.relation && field.computed.field) {
      const related = next[field.computed.relation];
      next[field.key] = Array.isArray(related)
        ? related.map((item) => (item as RecordData)?.[field.computed!.field!]).filter((value) => value !== undefined)
        : (related as RecordData | undefined)?.[field.computed.field];
    }
    if (field.type === 'rollup' && field.computed?.relation) {
      const related = next[field.computed.relation];
      const items = Array.isArray(related) ? related : related ? [related] : [];
      const values = field.computed.field ? items.map((item) => Number((item as RecordData)?.[field.computed!.field!])).filter(Number.isFinite) : [];
      switch (field.computed.operation) {
        case 'sum': next[field.key] = values.reduce((sum, value) => sum + value, 0); break;
        case 'avg': next[field.key] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; break;
        case 'min': next[field.key] = values.length ? Math.min(...values) : null; break;
        case 'max': next[field.key] = values.length ? Math.max(...values) : null; break;
        case 'first': next[field.key] = field.computed.field ? (items[0] as RecordData | undefined)?.[field.computed.field] ?? null : items[0] ?? null; break;
        case 'join': next[field.key] = values.join(', '); break;
        default: next[field.key] = items.length;
      }
    }
  }
  return next;
}

async function resolveRelationTargets(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  relation: AppRelationDefinition;
  links: Array<typeof teamAppMakerRecordLinks.$inferSelect>;
  context: AppMakerDataContext;
}) {
  if (input.relation.target.kind === 'entity') {
    const entity = findAppMakerEntity(input.definition, input.relation.target.key);
    if (!entity || !canUseAudience(entity.permissions.read, input.context)) return new Map<string, unknown>();
    const ids = input.links.map((link) => Number(link.targetRecordId)).filter((id) => Number.isInteger(id));
    if (!ids.length) return new Map<string, unknown>();
    const rows = await db.select().from(teamAppMakerRecords).where(and(
      eq(teamAppMakerRecords.teamId, input.context.teamId),
      eq(teamAppMakerRecords.appId, input.app.id),
      eq(teamAppMakerRecords.entityKey, entity.key),
      inArray(teamAppMakerRecords.id, ids),
    ));
    return new Map(rows.map((row) => [String(row.id), publicRecord(row, entity, input.context)]));
  }
  const resource = readOnlyResourceMap.get(input.relation.target.key);
  if (!resource) return new Map<string, unknown>();
  await assertSystemResourceAccess(input.relation.target.key, input.context);
  const uniqueIds = [...new Set(input.links.map((link) => link.targetRecordId))].slice(0, 100);
  const values = await Promise.all(uniqueIds.map(async (id) => {
    const value = await getReadOnlyResource(resource, input.context.teamId, id).catch(() => null);
    const visible = value && await canReadAppMakerChatRecord(input.relation.target.key, value as Record<string, unknown>, input.context);
    return [id, visible ? value : null] as const;
  }));
  return new Map(values.filter((entry) => entry[1] !== null));
}

async function includeRelations(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  entity: AppEntityDefinition;
  rows: RecordData[];
  includes: string[];
  context: AppMakerDataContext;
}) {
  if (!input.rows.length || !input.includes.length) return input.rows;
  let rows = input.rows;
  for (const relationKey of input.includes) {
    const relation = input.definition.dataModel.relations.find((candidate) => candidate.key === relationKey && candidate.source.key === input.entity.key);
    if (!relation) continue;
    const ids = rows.map((row) => Number(row.id)).filter(Number.isInteger);
    const links = await db.select().from(teamAppMakerRecordLinks).where(and(
      eq(teamAppMakerRecordLinks.teamId, input.context.teamId),
      eq(teamAppMakerRecordLinks.appId, input.app.id),
      eq(teamAppMakerRecordLinks.relationKey, relation.key),
      inArray(teamAppMakerRecordLinks.sourceRecordId, ids),
    ));
    const targets = await resolveRelationTargets({ ...input, relation, links });
    const bySource = new Map<number, unknown[]>();
    for (const link of links) {
      const target = targets.get(link.targetRecordId);
      if (target !== undefined) bySource.set(link.sourceRecordId, [...(bySource.get(link.sourceRecordId) ?? []), target]);
    }
    rows = rows.map((row) => {
      const related = bySource.get(Number(row.id)) ?? [];
      return { ...row, [relation.key]: ['belongs-to', 'one-to-one'].includes(relation.type) ? related[0] ?? null : related };
    });
  }
  return rows.map((row) => applyComputedFields(row, input.entity));
}

export async function listAppMakerEntityRecords(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  entityKey: string;
  source?: Pick<AppDataSourceDefinition, 'filters' | 'search' | 'pageSize' | 'fields' | 'sort' | 'include'>;
  page?: number;
  context: AppMakerDataContext;
}) {
  const entity = findAppMakerEntity(input.definition, input.entityKey);
  if (!entity) throw new Error('entity_not_found');
  assertEntityOperation(entity, 'read', input.context);
  const raw = await db.select().from(teamAppMakerRecords).where(and(
    eq(teamAppMakerRecords.teamId, input.context.teamId),
    eq(teamAppMakerRecords.appId, input.app.id),
    eq(teamAppMakerRecords.entityKey, entity.key),
  )).orderBy(desc(teamAppMakerRecords.updatedAt)).limit(2_000);
  let rows: RecordData[] = raw.map((row) => publicRecord(row, entity, input.context));
  if (input.source?.search) {
    const query = input.source.search.toLocaleLowerCase();
    rows = rows.filter((row) => entity.fields.some((field) => String(row[field.key] ?? '').toLocaleLowerCase().includes(query)));
  }
  for (const filter of input.source?.filters ?? []) rows = rows.filter((row) => matchesFilter(row, filter));
  rows = sortRows(rows, input.source?.sort);
  const total = rows.length;
  const perPage = input.source?.pageSize ?? 25;
  const page = Math.max(1, input.page ?? 1);
  rows = rows.slice((page - 1) * perPage, page * perPage);
  rows = await includeRelations({ ...input, entity, rows, includes: input.source?.include ?? [] });
  if (input.source?.fields?.length) {
    const allowed = new Set(['id', 'entityKey', 'version', 'createdAt', 'updatedAt', ...input.source.fields, ...(input.source.include ?? [])]);
    rows = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => allowed.has(key))));
  }
  return { data: rows, meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } };
}

export async function getAppMakerEntityRecord(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  entityKey: string;
  recordId: number;
  includes?: string[];
  context: AppMakerDataContext;
}) {
  const entity = findAppMakerEntity(input.definition, input.entityKey);
  if (!entity) throw new Error('entity_not_found');
  assertEntityOperation(entity, 'read', input.context);
  const [row] = await db.select().from(teamAppMakerRecords).where(and(
    eq(teamAppMakerRecords.id, input.recordId),
    eq(teamAppMakerRecords.teamId, input.context.teamId),
    eq(teamAppMakerRecords.appId, input.app.id),
    eq(teamAppMakerRecords.entityKey, entity.key),
  )).limit(1);
  if (!row) return null;
  const [resolved] = await includeRelations({ app: input.app, definition: input.definition, entity, rows: [publicRecord(row, entity, input.context)], includes: input.includes ?? [], context: input.context });
  return resolved;
}

async function audit(context: AppMakerDataContext, action: string, id: number) {
  await db.insert(activityLogs).values({ teamId: context.teamId, userId: context.userId, action, ipAddress: String(id) });
}

export async function createAppMakerEntityRecord(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  entityKey: string;
  values: RecordData;
  context: AppMakerDataContext;
}) {
  const entity = findAppMakerEntity(input.definition, input.entityKey);
  if (!entity) throw new Error('entity_not_found');
  assertEntityOperation(entity, 'create', input.context);
  const data = await normalizeRecordInput({ ...input, entity, operation: 'create' });
  const [row] = await db.insert(teamAppMakerRecords).values({
    teamId: input.context.teamId,
    appId: input.app.id,
    entityKey: entity.key,
    data,
    createdBy: input.context.userId,
    updatedBy: input.context.userId,
  }).returning();
  await audit(input.context, `app_maker.record.created.${entity.key}`, row.id);
  return publicRecord(row, entity, input.context);
}

export async function updateAppMakerEntityRecord(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  entityKey: string;
  recordId: number;
  values: RecordData;
  expectedVersion?: number;
  context: AppMakerDataContext;
}) {
  const entity = findAppMakerEntity(input.definition, input.entityKey);
  if (!entity) throw new Error('entity_not_found');
  assertEntityOperation(entity, 'update', input.context);
  const [current] = await db.select().from(teamAppMakerRecords).where(and(
    eq(teamAppMakerRecords.id, input.recordId),
    eq(teamAppMakerRecords.teamId, input.context.teamId),
    eq(teamAppMakerRecords.appId, input.app.id),
    eq(teamAppMakerRecords.entityKey, entity.key),
  )).limit(1);
  if (!current) throw new Error('record_not_found');
  if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) throw new Error(`record_version_conflict:${current.version}`);
  const currentData = current.data && typeof current.data === 'object' ? current.data as RecordData : {};
  const data = await normalizeRecordInput({ ...input, entity, operation: 'update', current: currentData, currentRecordId: current.id });
  const [row] = await db.update(teamAppMakerRecords).set({ data, version: current.version + 1, updatedBy: input.context.userId, updatedAt: new Date() }).where(and(
    eq(teamAppMakerRecords.id, current.id),
    eq(teamAppMakerRecords.version, current.version),
    eq(teamAppMakerRecords.teamId, input.context.teamId),
    eq(teamAppMakerRecords.appId, input.app.id),
  )).returning();
  if (!row) throw new Error(`record_version_conflict:${current.version + 1}`);
  await audit(input.context, `app_maker.record.updated.${entity.key}`, row.id);
  return publicRecord(row, entity, input.context);
}

export async function deleteAppMakerEntityRecord(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  entityKey: string;
  recordId: number;
  context: AppMakerDataContext;
  visited?: Set<string>;
}) {
  const entity = findAppMakerEntity(input.definition, input.entityKey);
  if (!entity) throw new Error('entity_not_found');
  assertEntityOperation(entity, 'delete', input.context);
  const marker = `${entity.key}:${input.recordId}`;
  const visited = input.visited ?? new Set<string>();
  if (visited.has(marker)) return;
  visited.add(marker);
  const incomingRelations = input.definition.dataModel.relations.filter((relation) => relation.target.kind === 'entity' && relation.target.key === entity.key);
  for (const relation of incomingRelations) {
    const links = await db.select().from(teamAppMakerRecordLinks).where(and(
      eq(teamAppMakerRecordLinks.teamId, input.context.teamId),
      eq(teamAppMakerRecordLinks.appId, input.app.id),
      eq(teamAppMakerRecordLinks.relationKey, relation.key),
      eq(teamAppMakerRecordLinks.targetKind, 'entity'),
      eq(teamAppMakerRecordLinks.targetKey, entity.key),
      eq(teamAppMakerRecordLinks.targetRecordId, String(input.recordId)),
    ));
    if (links.length && relation.onDelete === 'restrict') throw new Error(`relation_restrict:${relation.key}`);
    if (relation.onDelete === 'cascade') {
      for (const link of links) await deleteAppMakerEntityRecord({ ...input, entityKey: relation.source.key, recordId: link.sourceRecordId, visited });
    } else if (links.length) {
      await db.delete(teamAppMakerRecordLinks).where(inArray(teamAppMakerRecordLinks.id, links.map((link) => link.id)));
    }
  }
  const [deleted] = await db.delete(teamAppMakerRecords).where(and(
    eq(teamAppMakerRecords.id, input.recordId),
    eq(teamAppMakerRecords.teamId, input.context.teamId),
    eq(teamAppMakerRecords.appId, input.app.id),
    eq(teamAppMakerRecords.entityKey, entity.key),
  )).returning({ id: teamAppMakerRecords.id });
  if (!deleted) throw new Error('record_not_found');
  await audit(input.context, `app_maker.record.deleted.${entity.key}`, deleted.id);
}

export async function linkAppMakerRecords(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  relationKey: string;
  sourceRecordId: number;
  targetRecordId: string;
  metadata?: RecordData;
  context: AppMakerDataContext;
}) {
  const relation = input.definition.dataModel.relations.find((candidate) => candidate.key === input.relationKey);
  if (!relation) throw new Error('relation_not_found');
  const sourceEntity = findAppMakerEntity(input.definition, relation.source.key);
  if (!sourceEntity) throw new Error('entity_not_found');
  assertEntityOperation(sourceEntity, 'update', input.context);
  const source = await getAppMakerEntityRecord({ app: input.app, definition: input.definition, entityKey: sourceEntity.key, recordId: input.sourceRecordId, context: input.context });
  if (!source) throw new Error('record_not_found');
  if (relation.target.kind === 'entity') {
    const target = await getAppMakerEntityRecord({ app: input.app, definition: input.definition, entityKey: relation.target.key, recordId: Number(input.targetRecordId), context: input.context });
    if (!target) throw new Error('target_not_found');
  } else {
    const resource = readOnlyResourceMap.get(relation.target.key);
    await assertSystemResourceAccess(relation.target.key, input.context);
    const target = resource ? await getReadOnlyResource(resource, input.context.teamId, input.targetRecordId) : null;
    if (!target || !await canReadAppMakerChatRecord(relation.target.key, target as Record<string, unknown>, input.context)) throw new Error('target_not_found');
  }
  if (['belongs-to', 'one-to-one'].includes(relation.type)) {
    await db.delete(teamAppMakerRecordLinks).where(and(
      eq(teamAppMakerRecordLinks.teamId, input.context.teamId),
      eq(teamAppMakerRecordLinks.appId, input.app.id),
      eq(teamAppMakerRecordLinks.relationKey, relation.key),
      eq(teamAppMakerRecordLinks.sourceRecordId, input.sourceRecordId),
    ));
  }
  if (relation.type === 'one-to-one') {
    await db.delete(teamAppMakerRecordLinks).where(and(
      eq(teamAppMakerRecordLinks.teamId, input.context.teamId),
      eq(teamAppMakerRecordLinks.appId, input.app.id),
      eq(teamAppMakerRecordLinks.relationKey, relation.key),
      eq(teamAppMakerRecordLinks.targetKind, relation.target.kind),
      eq(teamAppMakerRecordLinks.targetKey, relation.target.key),
      eq(teamAppMakerRecordLinks.targetRecordId, input.targetRecordId),
    ));
  }
  const [link] = await db.insert(teamAppMakerRecordLinks).values({
    teamId: input.context.teamId,
    appId: input.app.id,
    relationKey: relation.key,
    sourceRecordId: input.sourceRecordId,
    targetKind: relation.target.kind,
    targetKey: relation.target.key,
    targetRecordId: input.targetRecordId,
    metadata: input.metadata ?? {},
    createdBy: input.context.userId,
  }).onConflictDoNothing().returning();
  await audit(input.context, `app_maker.record.linked.${relation.key}`, input.sourceRecordId);
  return link ?? null;
}

export async function unlinkAppMakerRecords(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  relationKey: string;
  sourceRecordId: number;
  targetRecordId: string;
  context: AppMakerDataContext;
}) {
  const relation = input.definition.dataModel.relations.find((candidate) => candidate.key === input.relationKey);
  if (!relation) throw new Error('relation_not_found');
  const entity = findAppMakerEntity(input.definition, relation.source.key);
  if (!entity) throw new Error('entity_not_found');
  assertEntityOperation(entity, 'update', input.context);
  const rows = await db.delete(teamAppMakerRecordLinks).where(and(
    eq(teamAppMakerRecordLinks.teamId, input.context.teamId),
    eq(teamAppMakerRecordLinks.appId, input.app.id),
    eq(teamAppMakerRecordLinks.relationKey, relation.key),
    eq(teamAppMakerRecordLinks.sourceRecordId, input.sourceRecordId),
    eq(teamAppMakerRecordLinks.targetRecordId, input.targetRecordId),
  )).returning({ id: teamAppMakerRecordLinks.id });
  await audit(input.context, `app_maker.record.unlinked.${relation.key}`, input.sourceRecordId);
  return rows.length;
}
