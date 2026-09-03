import 'server-only';

import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamAppMakerAttachments, teamAppMakerRecords } from '@/lib/db/schema';
import type { AppMakerRecord, ApplicationDefinition } from '../shared/contract';
import {
  assertEntityOperation,
  canUseAudience,
  findAppMakerEntity,
  getAppMakerEntityRecord,
  updateAppMakerEntityRecord,
  type AppMakerDataContext,
} from './data-model';

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const ATTACHMENT_TYPES = new Set(['file', 'image', 'audio', 'video']);
// Production and local Docker both mount this repository at /app. Keeping the
// root literal also prevents the Next file tracer from treating all of cwd as
// a possible attachment dependency.
const STORAGE_ROOT = '/app/.data/app-maker';

function safeFileName(value: string) {
  const base = path.basename(value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (base || 'archivo').slice(0, 240);
}

function assertMime(fieldType: string, mimeType: string) {
  if (fieldType === 'image' && !mimeType.startsWith('image/')) throw new Error('invalid_attachment_type');
  if (fieldType === 'audio' && !mimeType.startsWith('audio/')) throw new Error('invalid_attachment_type');
  if (fieldType === 'video' && !mimeType.startsWith('video/')) throw new Error('invalid_attachment_type');
}

function absoluteStoragePath(relativePath: string) {
  const resolved = path.resolve(STORAGE_ROOT, relativePath);
  if (resolved !== STORAGE_ROOT && !resolved.startsWith(`${STORAGE_ROOT}${path.sep}`)) throw new Error('invalid_storage_path');
  return resolved;
}

export async function listAppMakerAttachments(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  entityKey: string;
  recordId: number;
  context: AppMakerDataContext;
}) {
  const entity = findAppMakerEntity(input.definition, input.entityKey);
  if (!entity) throw new Error('entity_not_found');
  assertEntityOperation(entity, 'read', input.context);
  const record = await getAppMakerEntityRecord({ ...input });
  if (!record) throw new Error('record_not_found');
  const rows = await db.select({
    id: teamAppMakerAttachments.id,
    fieldKey: teamAppMakerAttachments.fieldKey,
    fileName: teamAppMakerAttachments.fileName,
    mimeType: teamAppMakerAttachments.mimeType,
    sizeBytes: teamAppMakerAttachments.sizeBytes,
    createdAt: teamAppMakerAttachments.createdAt,
  }).from(teamAppMakerAttachments).where(and(
    eq(teamAppMakerAttachments.teamId, input.context.teamId),
    eq(teamAppMakerAttachments.appId, input.app.id),
    eq(teamAppMakerAttachments.recordId, input.recordId),
  ));
  return rows.filter((row) => {
    const field = entity.fields.find((candidate) => candidate.key === row.fieldKey);
    return field && !field.hidden && canUseAudience(field.permissions.read, input.context);
  }).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function uploadAppMakerAttachment(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  entityKey: string;
  recordId: number;
  fieldKey: string;
  file: File;
  context: AppMakerDataContext;
}) {
  const entity = findAppMakerEntity(input.definition, input.entityKey);
  if (!entity) throw new Error('entity_not_found');
  assertEntityOperation(entity, 'update', input.context);
  const field = entity.fields.find((candidate) => candidate.key === input.fieldKey);
  if (!field || !ATTACHMENT_TYPES.has(field.type) || field.hidden || !input.file.size || input.file.size > MAX_ATTACHMENT_BYTES) throw new Error('invalid_attachment');
  assertMime(field.type, input.file.type || 'application/octet-stream');
  const current = await getAppMakerEntityRecord({ app: input.app, definition: input.definition, entityKey: entity.key, recordId: input.recordId, context: input.context });
  if (!current) throw new Error('record_not_found');
  const relativePath = path.join(String(input.context.teamId), String(input.app.id), String(input.recordId), `${randomUUID()}.bin`);
  const absolutePath = absoluteStoragePath(relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  await writeFile(absolutePath, Buffer.from(await input.file.arrayBuffer()), { mode: 0o600 });
  let attachmentId: number | null = null;
  try {
    const [attachment] = await db.insert(teamAppMakerAttachments).values({
      teamId: input.context.teamId,
      appId: input.app.id,
      recordId: input.recordId,
      fieldKey: field.key,
      fileName: safeFileName(input.file.name),
      mimeType: input.file.type || 'application/octet-stream',
      sizeBytes: input.file.size,
      storagePath: relativePath,
      createdBy: input.context.userId,
    }).returning();
    attachmentId = attachment.id;
    const currentIds = Array.isArray(current[field.key]) ? current[field.key] as unknown[] : [];
    await updateAppMakerEntityRecord({
      app: input.app,
      definition: input.definition,
      entityKey: entity.key,
      recordId: input.recordId,
      values: { [field.key]: [...currentIds, attachment.id] },
      expectedVersion: Number(current.version),
      context: input.context,
    });
    await db.insert(activityLogs).values({ teamId: input.context.teamId, userId: input.context.userId, action: `app_maker.attachment.uploaded.${entity.key}.${field.key}`, ipAddress: String(attachment.id) });
    return { id: attachment.id, fieldKey: attachment.fieldKey, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, createdAt: attachment.createdAt.toISOString() };
  } catch (error) {
    if (attachmentId) await db.delete(teamAppMakerAttachments).where(and(eq(teamAppMakerAttachments.id, attachmentId), eq(teamAppMakerAttachments.teamId, input.context.teamId), eq(teamAppMakerAttachments.appId, input.app.id))).catch(() => undefined);
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
}

export async function resolveAppMakerAttachment(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  attachmentId: number;
  context: AppMakerDataContext;
}) {
  const [row] = await db.select({ attachment: teamAppMakerAttachments, entityKey: teamAppMakerRecords.entityKey }).from(teamAppMakerAttachments)
    .innerJoin(teamAppMakerRecords, eq(teamAppMakerRecords.id, teamAppMakerAttachments.recordId))
    .where(and(
      eq(teamAppMakerAttachments.id, input.attachmentId),
      eq(teamAppMakerAttachments.teamId, input.context.teamId),
      eq(teamAppMakerAttachments.appId, input.app.id),
      eq(teamAppMakerRecords.teamId, input.context.teamId),
      eq(teamAppMakerRecords.appId, input.app.id),
    )).limit(1);
  if (!row) throw new Error('attachment_not_found');
  const entity = findAppMakerEntity(input.definition, row.entityKey);
  if (!entity) throw new Error('entity_not_found');
  assertEntityOperation(entity, 'read', input.context);
  const field = entity.fields.find((candidate) => candidate.key === row.attachment.fieldKey);
  if (!field || field.hidden || !canUseAudience(field.permissions.read, input.context)) throw new Error('attachment_read_forbidden');
  const absolutePath = absoluteStoragePath(row.attachment.storagePath);
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) throw new Error('attachment_not_found');
  await db.insert(activityLogs).values({ teamId: input.context.teamId, userId: input.context.userId, action: `app_maker.attachment.downloaded.${entity.key}.${field.key}`, ipAddress: String(row.attachment.id) });
  return { ...row.attachment, absolutePath, stream: createReadStream(absolutePath) };
}

export async function deleteAppMakerAttachment(input: {
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  attachmentId: number;
  context: AppMakerDataContext;
}) {
  const [row] = await db.select({ attachment: teamAppMakerAttachments, entityKey: teamAppMakerRecords.entityKey, data: teamAppMakerRecords.data, version: teamAppMakerRecords.version }).from(teamAppMakerAttachments)
    .innerJoin(teamAppMakerRecords, eq(teamAppMakerRecords.id, teamAppMakerAttachments.recordId))
    .where(and(
      eq(teamAppMakerAttachments.id, input.attachmentId),
      eq(teamAppMakerAttachments.teamId, input.context.teamId),
      eq(teamAppMakerAttachments.appId, input.app.id),
    )).limit(1);
  if (!row) throw new Error('attachment_not_found');
  const entity = findAppMakerEntity(input.definition, row.entityKey);
  if (!entity) throw new Error('entity_not_found');
  assertEntityOperation(entity, 'update', input.context);
  const data = row.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : {};
  const ids = Array.isArray(data[row.attachment.fieldKey]) ? data[row.attachment.fieldKey] as unknown[] : [];
  await updateAppMakerEntityRecord({
    app: input.app,
    definition: input.definition,
    entityKey: entity.key,
    recordId: row.attachment.recordId,
    values: { [row.attachment.fieldKey]: ids.filter((id) => Number(id) !== input.attachmentId) },
    expectedVersion: row.version,
    context: input.context,
  });
  await db.delete(teamAppMakerAttachments).where(and(eq(teamAppMakerAttachments.id, input.attachmentId), eq(teamAppMakerAttachments.teamId, input.context.teamId), eq(teamAppMakerAttachments.appId, input.app.id)));
  await unlink(absoluteStoragePath(row.attachment.storagePath)).catch(() => undefined);
  await db.insert(activityLogs).values({ teamId: input.context.teamId, userId: input.context.userId, action: `app_maker.attachment.deleted.${entity.key}.${row.attachment.fieldKey}`, ipAddress: String(input.attachmentId) });
}
