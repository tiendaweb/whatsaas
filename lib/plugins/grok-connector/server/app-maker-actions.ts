import 'server-only';

import { readFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import type { MemberPermissions } from '@/lib/permissions';
import {
  deleteAppMakerAttachment,
  listAppMakerAttachments,
  resolveAppMakerAttachment,
  uploadAppMakerAttachment,
} from '@/lib/plugins/app-maker/server/attachments';
import { appMakerConnectorCatalog, runAppMakerWorkflows } from '@/lib/plugins/app-maker/server/connectors';
import {
  createAppMakerEntityRecord,
  deleteAppMakerEntityRecord,
  getAppMakerEntityRecord,
  linkAppMakerRecords,
  listAppMakerEntityRecords,
  unlinkAppMakerRecords,
  updateAppMakerEntityRecord,
  type AppMakerDataContext,
} from '@/lib/plugins/app-maker/server/data-model';
import { canAccessApplication } from '@/lib/plugins/app-maker/server/resolver';
import {
  getAppMakerApp,
  listAppMakerApps,
  listAppMakerVersions,
  saveAppMakerApp,
  setAppMakerStatus,
} from '@/lib/plugins/app-maker/server/storage';
import { applicationDefinitionSchema, type AppMakerRecord, type ApplicationDefinition } from '@/lib/plugins/app-maker/shared/contract';
import {
  APP_MAKER_BLOCK_REGISTRY,
  APP_MAKER_CHART_TYPE_REGISTRY,
  APP_MAKER_CONNECTOR_REGISTRY,
  APP_MAKER_FIELD_TYPE_REGISTRY,
  APP_MAKER_FORM_FIELD_TYPE_REGISTRY,
  APP_MAKER_FORM_PRESENTATION_REGISTRY,
  APP_MAKER_NAVIGATION_REGISTRY,
  APP_MAKER_RELATION_TYPE_REGISTRY,
  APP_MAKER_TEMPLATE_REGISTRY,
  APP_MAKER_VIEW_REGISTRY,
} from '@/lib/plugins/app-maker/shared/registries';
import { APP_MAKER_DESIGN_TEMPLATES, APP_MAKER_DESIGN_TEMPLATE_KEYS } from '@/lib/plugins/app-maker/shared/design-templates';
import { assertPermission, mcpContent, parse, type GrokActionContext } from './actions';

const slugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(48);
const entityKeySchema = slugSchema;
const baseAppSchema = z.object({ slug: slugSchema, draft: z.boolean().default(false) });
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

async function appMakerContext(context: GrokActionContext, write = false): Promise<AppMakerDataContext> {
  await assertPermission(context, write ? 'miniAppsWrite' : 'miniAppsRead', 'app-maker');
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, context.teamId), eq(teamMembers.userId, context.userId)),
    columns: { role: true, permissions: true },
  });
  if (!member) throw new Error('Team membership not found.');
  return { ...context, role: member.role, permissions: member.permissions as MemberPermissions | null };
}

async function accessibleApp(input: {
  context: GrokActionContext;
  slug: string;
  draft?: boolean;
  write?: boolean;
}) {
  const dataContext = await appMakerContext(input.context, Boolean(input.write || input.draft));
  const app = await getAppMakerApp(input.context.teamId, input.slug);
  if (!app || app.status === 'archived') throw new Error('App Maker application not found.');
  if (!input.draft && !app.publishedDefinition) throw new Error('App Maker application is not published.');
  const definition = input.draft ? app.definition : app.publishedDefinition!;
  if (!canAccessApplication(definition, { userId: dataContext.userId, role: dataContext.role })) throw new Error('App Maker application access denied.');
  return { app, definition, dataContext };
}

function appSummary(app: AppMakerRecord) {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    status: app.status,
    version: app.version,
    publishedVersion: app.publishedVersion,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

function catalog() {
  return {
    runtime: 'app-maker-v1',
    designTemplates: APP_MAKER_DESIGN_TEMPLATES,
    applicationTemplates: APP_MAKER_TEMPLATE_REGISTRY.map((template) => ({ key: template.key, name: template.name, description: template.description, definition: template.definition })),
    views: APP_MAKER_VIEW_REGISTRY,
    blocks: APP_MAKER_BLOCK_REGISTRY,
    navigation: APP_MAKER_NAVIGATION_REGISTRY,
    dataFieldTypes: APP_MAKER_FIELD_TYPE_REGISTRY,
    formFieldTypes: APP_MAKER_FORM_FIELD_TYPE_REGISTRY,
    formPresentations: APP_MAKER_FORM_PRESENTATION_REGISTRY,
    charts: APP_MAKER_CHART_TYPE_REGISTRY,
    relations: APP_MAKER_RELATION_TYPE_REGISTRY,
    connectors: APP_MAKER_CONNECTOR_REGISTRY,
    connectorActions: appMakerConnectorCatalog(),
  };
}

function recordSource(data: {
  page_size: number;
  search?: string;
  filters?: Array<{ field: string; operator: 'eq' | 'neq' | 'contains' | 'starts-with' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is-empty'; value: string | number | boolean | null }>;
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  fields?: string[];
  include?: string[];
}) {
  return {
    pageSize: data.page_size,
    ...(data.search ? { search: data.search } : {}),
    ...(data.filters ? { filters: data.filters } : {}),
    ...(data.sort ? { sort: data.sort } : {}),
    ...(data.fields ? { fields: data.fields } : {}),
    ...(data.include ? { include: data.include } : {}),
  };
}

function strictBase64(value: string) {
  const normalized = value.replace(/\s+/g, '');
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) throw new Error('data_base64 is invalid.');
  const buffer = Buffer.from(normalized, 'base64');
  if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) throw new Error('Attachment must contain between 1 byte and 50 MB.');
  return buffer;
}

function attachmentUri(slug: string, attachment: { id: number; fileName: string }) {
  return `appmaker://${slug}/attachments/${attachment.id}/${encodeURIComponent(attachment.fileName)}`;
}

export async function executeAppMakerTool(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (name === 'whatspro_appmaker_catalog') {
    await appMakerContext(context);
    return catalog();
  }
  if (name === 'whatspro_appmaker_list_apps') {
    const data = parse(z.object({ include_archived: z.boolean().default(false) }), input);
    const dataContext = await appMakerContext(context);
    const apps = await listAppMakerApps(context.teamId, { includeArchived: data.include_archived });
    return {
      object: 'appmaker_app_list',
      data: apps.filter((app) => {
        const definition = app.publishedDefinition ?? app.definition;
        return canAccessApplication(definition, { userId: dataContext.userId, role: dataContext.role });
      }).map(appSummary),
    };
  }
  if (name === 'whatspro_appmaker_get_app') {
    const data = parse(baseAppSchema.extend({ include_versions: z.boolean().default(false) }), input);
    const resolved = await accessibleApp({ context, ...data });
    return {
      object: 'appmaker_app',
      data: { ...appSummary(resolved.app), draft: data.draft, definition: resolved.definition },
      ...(data.include_versions ? { versions: await listAppMakerVersions(context.teamId, data.slug) } : {}),
    };
  }
  if (name === 'whatspro_appmaker_list_versions') {
    const data = parse(z.object({ slug: slugSchema }), input);
    await accessibleApp({ context, slug: data.slug });
    return { object: 'appmaker_version_list', data: await listAppMakerVersions(context.teamId, data.slug) };
  }
  if (name === 'whatspro_appmaker_list_records') {
    const data = parse(baseAppSchema.extend({
      entity_key: entityKeySchema,
      page: z.number().int().positive().default(1),
      page_size: z.number().int().min(1).max(100).default(25),
      search: z.string().max(300).optional(),
      filters: z.array(z.object({ field: entityKeySchema, operator: z.enum(['eq', 'neq', 'contains', 'starts-with', 'gt', 'gte', 'lt', 'lte', 'in', 'is-empty']), value: z.union([z.string(), z.number(), z.boolean(), z.null()]).default(null) })).max(20).optional(),
      sort: z.array(z.object({ field: entityKeySchema, direction: z.enum(['asc', 'desc']) })).max(10).optional(),
      fields: z.array(entityKeySchema).max(100).optional(),
      include: z.array(entityKeySchema).max(20).optional(),
    }), input);
    const resolved = await accessibleApp({ context, ...data });
    return listAppMakerEntityRecords({ app: resolved.app, definition: resolved.definition, entityKey: data.entity_key, page: data.page, source: recordSource(data), context: resolved.dataContext });
  }
  if (name === 'whatspro_appmaker_get_record') {
    const data = parse(baseAppSchema.extend({ entity_key: entityKeySchema, record_id: z.number().int().positive(), include: z.array(entityKeySchema).max(20).optional() }), input);
    const resolved = await accessibleApp({ context, ...data });
    const record = await getAppMakerEntityRecord({ app: resolved.app, definition: resolved.definition, entityKey: data.entity_key, recordId: data.record_id, includes: data.include, context: resolved.dataContext });
    if (!record) throw new Error('Record not found.');
    return { object: 'appmaker_record', data: record };
  }
  if (name === 'whatspro_appmaker_list_attachments') {
    const data = parse(baseAppSchema.extend({ entity_key: entityKeySchema, record_id: z.number().int().positive() }), input);
    const resolved = await accessibleApp({ context, ...data });
    return { object: 'appmaker_attachment_list', data: await listAppMakerAttachments({ app: resolved.app, definition: resolved.definition, entityKey: data.entity_key, recordId: data.record_id, context: resolved.dataContext }) };
  }
  if (name === 'whatspro_appmaker_save_app') {
    const data = parse(z.object({ definition: z.unknown(), expected_version: z.number().int().positive().optional(), status: z.enum(['draft', 'preview']).default('draft'), summary: z.string().max(300).optional() }), input);
    const definition = applicationDefinitionSchema.safeParse(data.definition);
    if (!definition.success) throw new Error(`Invalid App Maker definition: ${definition.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    const dataContext = await appMakerContext(context, true);
    const current = await getAppMakerApp(context.teamId, definition.data.slug);
    if (current) {
      if (current.status === 'archived') throw new Error('Archived App Maker applications cannot be edited.');
      if (data.expected_version === undefined) throw new Error(`expected_version is required when updating an app (current: ${current.version}).`);
      if (!canAccessApplication(current.definition, { userId: dataContext.userId, role: dataContext.role })) throw new Error('App Maker application access denied.');
    }
    const result = await saveAppMakerApp({ teamId: context.teamId, userId: context.userId, definition: definition.data, expectedVersion: data.expected_version, status: data.status, summary: data.summary });
    if (!result.saved || !result.app) throw new Error(`App Maker definition rejected: ${result.errors.map((error) => `${error.path}: ${error.message}`).join('; ')}`);
    return { success: true, app: appSummary(result.app), errors: [] };
  }
  if (name === 'whatspro_appmaker_set_design') {
    const data = parse(z.object({ slug: slugSchema, template: z.enum(APP_MAKER_DESIGN_TEMPLATE_KEYS), expected_version: z.number().int().positive(), summary: z.string().max(300).optional() }), input);
    const resolved = await accessibleApp({ context, slug: data.slug, draft: true, write: true });
    const result = await saveAppMakerApp({ teamId: context.teamId, userId: context.userId, definition: { ...resolved.definition, design: { template: data.template } }, expectedVersion: data.expected_version, summary: data.summary ?? `Diseño ${data.template}` });
    if (!result.saved || !result.app) throw new Error('Could not apply the design template.');
    return { success: true, app: appSummary(result.app), design: result.app.definition.design };
  }
  if (name === 'whatspro_appmaker_publish_app') {
    const data = parse(z.object({ slug: slugSchema, expected_version: z.number().int().positive(), summary: z.string().max(300).optional() }), input);
    const resolved = await accessibleApp({ context, slug: data.slug, draft: true, write: true });
    const result = await saveAppMakerApp({ teamId: context.teamId, userId: context.userId, definition: resolved.definition, expectedVersion: data.expected_version, status: 'published', summary: data.summary ?? 'Publicación desde conector MCP' });
    if (!result.saved || !result.app) throw new Error('Could not publish the App Maker application.');
    return { success: true, app: appSummary(result.app) };
  }
  if (name === 'whatspro_appmaker_archive_app') {
    const data = parse(z.object({ slug: slugSchema, confirm: z.literal(true) }), input);
    await accessibleApp({ context, slug: data.slug, draft: true, write: true });
    const app = await setAppMakerStatus({ teamId: context.teamId, userId: context.userId, slug: data.slug, status: 'archived' });
    if (!app) throw new Error('App Maker application not found.');
    return { success: true, app: appSummary(app) };
  }

  const recordBase = baseAppSchema.extend({ entity_key: entityKeySchema });
  if (name === 'whatspro_appmaker_create_record') {
    const data = parse(recordBase.extend({ values: z.record(z.string(), z.unknown()), run_workflows: z.boolean().default(true) }), input);
    const resolved = await accessibleApp({ context, ...data, write: true });
    const record = await createAppMakerEntityRecord({ app: resolved.app, definition: resolved.definition, entityKey: data.entity_key, values: data.values, context: resolved.dataContext });
    const workflows = data.run_workflows ? await runAppMakerWorkflows({ trigger: 'record-created', entityKey: data.entity_key, app: resolved.app, definition: resolved.definition, context: resolved.dataContext, row: record }) : [];
    return { success: true, record, workflows };
  }
  if (name === 'whatspro_appmaker_update_record') {
    const data = parse(recordBase.extend({ record_id: z.number().int().positive(), values: z.record(z.string(), z.unknown()), expected_version: z.number().int().positive(), run_workflows: z.boolean().default(true) }), input);
    const resolved = await accessibleApp({ context, ...data, write: true });
    const previous = await getAppMakerEntityRecord({ app: resolved.app, definition: resolved.definition, entityKey: data.entity_key, recordId: data.record_id, context: resolved.dataContext });
    const record = await updateAppMakerEntityRecord({ app: resolved.app, definition: resolved.definition, entityKey: data.entity_key, recordId: data.record_id, values: data.values, expectedVersion: data.expected_version, context: resolved.dataContext });
    const workflows = data.run_workflows ? await runAppMakerWorkflows({ trigger: 'record-updated', entityKey: data.entity_key, app: resolved.app, definition: resolved.definition, context: resolved.dataContext, row: record, previous: previous ?? undefined }) : [];
    return { success: true, record, workflows };
  }
  if (name === 'whatspro_appmaker_delete_record') {
    const data = parse(recordBase.extend({ record_id: z.number().int().positive(), confirm: z.literal(true), run_workflows: z.boolean().default(true) }), input);
    const resolved = await accessibleApp({ context, ...data, write: true });
    const previous = await getAppMakerEntityRecord({ app: resolved.app, definition: resolved.definition, entityKey: data.entity_key, recordId: data.record_id, context: resolved.dataContext });
    await deleteAppMakerEntityRecord({ app: resolved.app, definition: resolved.definition, entityKey: data.entity_key, recordId: data.record_id, context: resolved.dataContext });
    const workflows = data.run_workflows ? await runAppMakerWorkflows({ trigger: 'record-deleted', entityKey: data.entity_key, app: resolved.app, definition: resolved.definition, context: resolved.dataContext, previous: previous ?? undefined }) : [];
    return { success: true, deleted: true, record_id: data.record_id, workflows };
  }
  if (name === 'whatspro_appmaker_link_record' || name === 'whatspro_appmaker_unlink_record') {
    const data = parse(baseAppSchema.extend({ relation_key: entityKeySchema, source_record_id: z.number().int().positive(), target_record_id: z.union([z.string().min(1), z.number().int()]), metadata: z.record(z.string(), z.unknown()).optional(), confirm: z.literal(true).optional() }), input);
    if (name.endsWith('unlink_record') && data.confirm !== true) throw new Error('confirm=true is required.');
    const resolved = await accessibleApp({ context, ...data, write: true });
    if (name.endsWith('link_record')) {
      const link = await linkAppMakerRecords({ app: resolved.app, definition: resolved.definition, relationKey: data.relation_key, sourceRecordId: data.source_record_id, targetRecordId: String(data.target_record_id), metadata: data.metadata, context: resolved.dataContext });
      return { success: true, link };
    }
    const unlinked = await unlinkAppMakerRecords({ app: resolved.app, definition: resolved.definition, relationKey: data.relation_key, sourceRecordId: data.source_record_id, targetRecordId: String(data.target_record_id), context: resolved.dataContext });
    return { success: true, unlinked };
  }
  if (name === 'whatspro_appmaker_run_workflow') {
    const data = parse(baseAppSchema.extend({ workflow_key: entityKeySchema, row: z.record(z.string(), z.unknown()).optional(), previous: z.record(z.string(), z.unknown()).optional() }), input);
    const resolved = await accessibleApp({ context, ...data, write: true });
    const workflow = resolved.definition.workflows.find((item) => item.key === data.workflow_key && item.enabled && item.trigger.type === 'manual');
    if (!workflow) throw new Error('Enabled manual workflow not found.');
    return { success: true, workflows: await runAppMakerWorkflows({ trigger: 'manual', workflowKey: workflow.key, app: resolved.app, definition: resolved.definition, context: resolved.dataContext, row: data.row, previous: data.previous }) };
  }
  if (name === 'whatspro_appmaker_get_attachment') {
    const data = parse(baseAppSchema.extend({ attachment_id: z.number().int().positive() }), input);
    const resolved = await accessibleApp({ context, ...data });
    const attachment = await resolveAppMakerAttachment({ app: resolved.app, definition: resolved.definition, attachmentId: data.attachment_id, context: resolved.dataContext });
    if (attachment.sizeBytes > MAX_ATTACHMENT_BYTES) throw new Error('Attachment exceeds the 50 MB connector limit.');
    const bytes = await readFile(attachment.absolutePath);
    const uri = attachmentUri(data.slug, attachment);
    if (attachment.mimeType.startsWith('image/')) return mcpContent([{ type: 'image', data: bytes.toString('base64'), mimeType: attachment.mimeType }]);
    if (attachment.mimeType.startsWith('audio/')) return mcpContent([{ type: 'audio', data: bytes.toString('base64'), mimeType: attachment.mimeType }]);
    const textual = attachment.mimeType.startsWith('text/') || ['application/json', 'application/xml', 'application/javascript'].includes(attachment.mimeType);
    return mcpContent([{ type: 'resource', resource: textual
      ? { uri, mimeType: attachment.mimeType, text: bytes.toString('utf8') }
      : { uri, mimeType: attachment.mimeType, blob: bytes.toString('base64') } }]);
  }
  if (name === 'whatspro_appmaker_upload_attachment') {
    const data = parse(baseAppSchema.extend({ entity_key: entityKeySchema, record_id: z.number().int().positive(), field_key: entityKeySchema, file_name: z.string().trim().min(1).max(240), mime_type: z.string().trim().min(1).max(160), data_base64: z.string().min(1) }), input);
    const resolved = await accessibleApp({ context, ...data, write: true });
    const bytes = strictBase64(data.data_base64);
    const attachment = await uploadAppMakerAttachment({ app: resolved.app, definition: resolved.definition, entityKey: data.entity_key, recordId: data.record_id, fieldKey: data.field_key, file: new globalThis.File([bytes], data.file_name, { type: data.mime_type }), context: resolved.dataContext });
    return { success: true, attachment };
  }
  if (name === 'whatspro_appmaker_delete_attachment') {
    const data = parse(baseAppSchema.extend({ attachment_id: z.number().int().positive(), confirm: z.literal(true) }), input);
    const resolved = await accessibleApp({ context, ...data, write: true });
    await deleteAppMakerAttachment({ app: resolved.app, definition: resolved.definition, attachmentId: data.attachment_id, context: resolved.dataContext });
    return { success: true, deleted: true, attachment_id: data.attachment_id };
  }
  throw new Error(`Unknown App Maker tool: ${name}`);
}
