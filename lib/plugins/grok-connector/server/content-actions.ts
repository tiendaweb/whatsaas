import 'server-only';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { evolutionInstances } from '@/lib/db/schema';
import { ensureDraftStorage } from '@/lib/drafts/bootstrap';
import { generateDraft } from '@/lib/drafts/generate';
import { parseDraftWritePayload } from '@/lib/drafts/payload';
import { createDraft, deleteDraft, getDraft, updateDraft } from '@/lib/drafts/service';
import { formBuilderFormInputSchema, submissionStatusSchema } from '@/lib/plugins/form-builder/server/schema';
import {
  createForm,
  deleteForm,
  getFormWithInstanceForTeam,
  setSubmissionStatus,
  updateForm,
} from '@/lib/plugins/form-builder/server/service';
import { getBaseUrl } from '@/lib/tenant/urls';
import { assertPermission, audit, parse, type GrokActionContext, type GrokActionTool } from './actions';

/**
 * Contenido por MCP: borradores de mensaje y formularios públicos.
 *
 * Toda la lógica vive en `lib/drafts/**` y `lib/plugins/form-builder/server/**`,
 * que son las mismas funciones que consumen las routes de la pantalla. Acá sólo
 * hay catálogo, validación de entrada y permisos.
 *
 * Las lecturas ya están cubiertas por `whatspro_list_records` con los recursos
 * "drafts", "forms" y "form-submissions": por eso no hay tools de lectura acá.
 */

const AI_CHAT_PLUGIN = 'ai-chat';
const FORM_BUILDER_PLUGIN = 'form-builder';

const FORM_FIELD_TYPES = ['text', 'textarea', 'email', 'phone', 'number', 'select', 'checkbox', 'date'] as const;
const SUBMISSION_STATUSES = ['new', 'in_review', 'managed', 'archived'] as const;

export const contentReadTools: GrokActionTool[] = [];

const draftFieldProperties = {
  title: { type: 'string', minLength: 1, maxLength: 255, description: 'Título interno del borrador (no se envía al cliente).' },
  content: { type: 'string', minLength: 1, maxLength: 20000, description: 'Texto del mensaje. En borradores "dynamic" los huecos van como [[variable]].' },
  draft_type: { type: 'string', enum: ['static', 'dynamic'], description: '"static" = texto final; "dynamic" = con placeholders [[variable]]. Por defecto static.' },
  category_id: { type: ['integer', 'null'], minimum: 1, description: 'Categoría de borradores (whatspro_list_records resource="draft-categories"). null la quita.' },
  contact_id: { type: ['integer', 'null'], minimum: 1, description: 'Contacto al que está pensado el borrador. null lo desvincula.' },
  assigned_user_id: { type: ['integer', 'null'], minimum: 1, description: 'Responsable (miembro del equipo). null desasigna.' },
  department_id: { type: ['integer', 'null'], minimum: 1, description: 'Sector (departamento). null lo quita.' },
  tag_ids: {
    type: 'array',
    maxItems: 50,
    uniqueItems: true,
    items: { type: 'integer', minimum: 1 },
    description: 'Etiquetas de borrador (NO son las etiquetas del CRM). Reemplaza la lista entera.',
  },
} as const;

export const contentActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_manage_draft',
    description:
      'Crea, edita o borra un BORRADOR de mensaje (la biblioteca de textos reutilizables de la app Borradores). Un borrador NO se envía a nadie: es texto guardado que después una persona o whatspro_chat_send_message usa. action="create" exige title y content; action="update" exige draft_id y sólo cambia lo que mandás (lo demás se conserva, incluidas las etiquetas si no mandás tag_ids); action="delete" exige draft_id y confirm=true, y es definitivo. Las referencias (categoría, contacto, responsable, sector, etiquetas) tienen que ser de este equipo. Para listar o buscar borradores usá whatspro_list_records(resource="drafts").',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        draft_id: { type: 'integer', minimum: 1, description: 'Obligatorio en update y delete.' },
        ...draftFieldProperties,
        is_archived: { type: 'boolean', description: 'Sólo en update: true archiva el borrador (deja de aparecer en la lista), false lo restaura.' },
        confirm: { type: 'boolean', description: 'Obligatorio en delete: true confirma el borrado definitivo.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_drafts_generate',
    description:
      'Genera el texto de un borrador con la IA configurada del equipo y lo GUARDA como borrador nuevo en la app Borradores. CONSUME CUOTA DE IA del equipo. NO envía ningún mensaje a ningún cliente: sólo crea un borrador que después alguien revisa y usa. mode="create" redacta desde cero, "rewrite" reescribe base_content más claro y listo para WhatsApp, "variables" arma o mejora un borrador dinámico con huecos [[variable]]. Con save=false devuelve el texto generado sin guardar nada (para iterar antes de persistir). Si el equipo no tiene proveedor de IA configurado, falla con ese motivo.',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', minLength: 1, maxLength: 8000, description: 'Instrucciones para la IA: qué mensaje querés, para quién, en qué tono.' },
        mode: { type: 'string', enum: ['create', 'rewrite', 'variables'], description: 'Por defecto "create".' },
        base_content: { type: 'string', maxLength: 20000, description: 'Borrador base a mejorar (obligatorio en la práctica para mode="rewrite").' },
        draft_type: { type: 'string', enum: ['static', 'dynamic'], description: '"dynamic" pide placeholders [[variable]]. Por defecto static.' },
        title: { type: 'string', minLength: 1, maxLength: 255, description: 'Título del borrador guardado. Si se omite se deriva del prompt.' },
        save: { type: 'boolean', description: 'false = sólo generar y devolver el texto, sin crear el borrador. Por defecto true.' },
        category_id: { type: 'integer', minimum: 1 },
        contact_id: { type: 'integer', minimum: 1 },
        tag_ids: { type: 'array', maxItems: 50, uniqueItems: true, items: { type: 'integer', minimum: 1 } },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_form',
    description:
      'Crea, edita o borra un FORMULARIO público del Form Builder (una página web con campos que, al enviarse, crea o actualiza el contacto en WhatsPro y le manda la confirmación por WhatsApp desde la instancia elegida). action="create" exige name y fields; instance_id es la instancia de WhatsApp que manda la confirmación: si el equipo tiene una sola se usa esa, si tiene varias hay que elegir. action="update" exige form_id y es parcial: lo que no mandás se conserva, PERO fields reemplaza la lista entera. action="delete" exige form_id y confirm=true: borra también todos los envíos recibidos, sin vuelta atrás. Reglas del servidor: las keys de campo son únicas y sólo letras/números/guion bajo; un select necesita options; para status="published" hace falta al menos un campo y uno de teléfono (type="phone"). Devuelve public_url, que sólo responde cuando el formulario está publicado. Para leer formularios y envíos: whatspro_list_records(resource="forms" | "form-submissions").',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        form_id: { type: 'integer', minimum: 1, description: 'Obligatorio en update y delete.' },
        name: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: ['string', 'null'], maxLength: 1000 },
        slug: { type: ['string', 'null'], maxLength: 180, description: 'Identificador legible. Si choca con otro del equipo se le agrega un sufijo. Si se omite sale del nombre.' },
        status: { type: 'string', enum: ['draft', 'published'], description: 'Sólo "published" responde en la URL pública. Por defecto draft.' },
        instance_id: { type: 'integer', minimum: 1, description: 'Instancia de WhatsApp que envía la confirmación. Ids en whatspro_list_records(resource="instances").' },
        fields: {
          type: 'array',
          maxItems: 80,
          description: 'Campos del formulario, en orden. En update reemplaza la lista completa.',
          items: {
            type: 'object',
            required: ['key', 'label', 'type'],
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 80, description: 'Id estable del campo. Si se omite se usa la key.' },
              key: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-zA-Z0-9_]+$', description: 'Nombre técnico, único en el formulario. Se puede usar como {{key}} en el mensaje de confirmación.' },
              label: { type: 'string', minLength: 1, maxLength: 140 },
              type: { type: 'string', enum: [...FORM_FIELD_TYPES] },
              required: { type: 'boolean' },
              placeholder: { type: 'string', maxLength: 180 },
              options: { type: 'array', maxItems: 40, items: { type: 'string', minLength: 1, maxLength: 120 }, description: 'Sólo para type="select".' },
            },
            additionalProperties: false,
          },
        },
        style: {
          type: 'object',
          properties: {
            theme: { type: 'string', enum: ['blank', 'classic', 'soft'] },
            background: { type: 'string', maxLength: 80 },
            text_color: { type: 'string', maxLength: 80 },
            accent_color: { type: 'string', maxLength: 80 },
            border_radius: { type: 'string', enum: ['none', 'small', 'medium', 'large'] },
          },
          additionalProperties: false,
        },
        submit_button_label: { type: 'string', minLength: 1, maxLength: 80 },
        success_message: { type: 'string', minLength: 1, maxLength: 1000, description: 'Lo que ve la persona en la página al enviar.' },
        confirmation_message: { type: 'string', minLength: 1, maxLength: 5000, description: 'Lo que recibe por WhatsApp. Acepta {{nombre}}, {{telefono}}, {{formulario}}, {{datos}} y {{key_de_campo}}.' },
        confirm: { type: 'boolean', description: 'Obligatorio en delete.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_form_submission_status',
    description:
      'Cambia el estado de revisión de un ENVÍO de formulario: "new" (sin revisar), "in_review", "managed" (gestionado) o "archived". Queda registrado quién lo revisó y cuándo; volver a "new" limpia esa marca. No toca el contacto ni manda nada. Los ids salen de whatspro_list_records(resource="form-submissions").',
    inputSchema: {
      type: 'object',
      required: ['submission_id', 'status'],
      properties: {
        submission_id: { type: 'integer', minimum: 1 },
        status: { type: 'string', enum: [...SUBMISSION_STATUSES] },
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Borradores                                                          */
/* ------------------------------------------------------------------ */

const nullableId = z.number().int().positive().nullable().optional();

const manageDraftSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  draft_id: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(255).optional(),
  content: z.string().trim().min(1).max(20000).optional(),
  draft_type: z.enum(['static', 'dynamic']).optional(),
  category_id: nullableId,
  contact_id: nullableId,
  assigned_user_id: nullableId,
  department_id: nullableId,
  tag_ids: z.array(z.number().int().positive()).max(50).optional(),
  is_archived: z.boolean().optional(),
  confirm: z.boolean().optional(),
});

async function ensureDrafts() {
  const storage = await ensureDraftStorage('mcp.content');
  if (!storage.ok) throw new Error(storage.clientMessage);
}

/** Mismo contrato que las routes: el body pasa por `parseDraftWritePayload`. */
function toDraftPayload(body: Record<string, unknown>) {
  const parsed = parseDraftWritePayload(body);
  if (!parsed.ok) throw new Error(`Invalid arguments: ${parsed.error}`);
  return parsed.value;
}

async function manageDraft(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'drafts');
  const data = parse(manageDraftSchema, input);
  await ensureDrafts();

  if (data.action === 'delete') {
    if (!data.draft_id) throw new Error('draft_id es obligatorio para delete.');
    if (data.confirm !== true) throw new Error('confirm debe ser true: el borrado del borrador es definitivo.');
    await deleteDraft(context.teamId, data.draft_id);
    await audit(context, 'CONNECTOR_DRAFT_DELETED', data.draft_id);
    return { success: true, action: 'delete', draft_id: data.draft_id };
  }

  if (data.action === 'create') {
    if (!data.title || !data.content) throw new Error('title y content son obligatorios para create.');
    const payload = toDraftPayload({
      title: data.title,
      content: data.content,
      draftType: data.draft_type ?? 'static',
      categoryId: data.category_id ?? null,
      contactId: data.contact_id ?? null,
      assignedUserId: data.assigned_user_id ?? null,
      departmentId: data.department_id ?? null,
      tagIds: data.tag_ids ?? [],
    });
    const draft = await createDraft(context.teamId, context.userId, payload);
    await audit(context, 'CONNECTOR_DRAFT_CREATED', draft.id);
    return { success: true, action: 'create', draft };
  }

  if (!data.draft_id) throw new Error('draft_id es obligatorio para update.');
  const current = await getDraft(context.teamId, data.draft_id);
  if (!current) throw new Error('Draft not found');

  // updateDraft es un reemplazo completo (semántica PUT de la route): la
  // edición parcial se resuelve acá, mezclando con lo que ya está guardado.
  const has = (key: keyof typeof data) => data[key] !== undefined;
  const payload = toDraftPayload({
    title: data.title ?? current.title,
    content: data.content ?? current.content,
    draftType: data.draft_type ?? current.draftType,
    aiMetadata: current.aiMetadata,
    categoryId: has('category_id') ? data.category_id : current.categoryId,
    contactId: has('contact_id') ? data.contact_id : current.contactId,
    assignedUserId: has('assigned_user_id') ? data.assigned_user_id : current.assignedUserId,
    departmentId: has('department_id') ? data.department_id : current.departmentId,
    tagIds: data.tag_ids ?? current.relationships.tagIds,
    stages: current.stages,
  });
  const draft = await updateDraft(context.teamId, context.userId, data.draft_id, {
    ...payload,
    isArchived: data.is_archived ?? Boolean(current.isArchived),
  });
  await audit(context, 'CONNECTOR_DRAFT_UPDATED', draft.id);
  return { success: true, action: 'update', draft };
}

const generateDraftSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
  mode: z.enum(['create', 'rewrite', 'variables']).optional(),
  base_content: z.string().max(20000).optional(),
  draft_type: z.enum(['static', 'dynamic']).optional(),
  title: z.string().trim().min(1).max(255).optional(),
  save: z.boolean().default(true),
  category_id: z.number().int().positive().optional(),
  contact_id: z.number().int().positive().optional(),
  tag_ids: z.array(z.number().int().positive()).max(50).optional(),
});

async function draftsGenerate(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'drafts', AI_CHAT_PLUGIN);
  const data = parse(generateDraftSchema, input);

  const generated = await generateDraft(context.teamId, context.userId, {
    prompt: data.prompt,
    mode: data.mode,
    baseContent: data.base_content,
    draftType: data.draft_type,
  });

  if (!data.save) {
    return { saved: false, content: generated.content, draft_type: generated.draftType, metadata: generated.metadata, sent: false };
  }

  await ensureDrafts();
  const title = data.title ?? data.prompt.replace(/\s+/g, ' ').slice(0, 80);
  const payload = toDraftPayload({
    title,
    content: generated.content,
    draftType: generated.draftType,
    aiMetadata: generated.metadata,
    categoryId: data.category_id ?? null,
    contactId: data.contact_id ?? null,
    tagIds: data.tag_ids ?? [],
  });
  const draft = await createDraft(context.teamId, context.userId, payload);
  await audit(context, 'CONNECTOR_DRAFT_GENERATED', draft.id);
  return {
    saved: true,
    sent: false,
    draft,
    note: 'Es un borrador guardado, no un mensaje enviado. Para mandarlo a un chat usá whatspro_chat_send_message.',
  };
}

/* ------------------------------------------------------------------ */
/* Formularios                                                         */
/* ------------------------------------------------------------------ */

const formFieldInputSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  key: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/),
  label: z.string().min(1).max(140),
  type: z.enum(FORM_FIELD_TYPES),
  required: z.boolean().optional(),
  placeholder: z.string().max(180).optional(),
  options: z.array(z.string().min(1).max(120)).max(40).optional(),
});

const formStyleInputSchema = z.object({
  theme: z.enum(['blank', 'classic', 'soft']).optional(),
  background: z.string().max(80).optional(),
  text_color: z.string().max(80).optional(),
  accent_color: z.string().max(80).optional(),
  border_radius: z.enum(['none', 'small', 'medium', 'large']).optional(),
});

const manageFormSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  form_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  slug: z.string().max(180).nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
  instance_id: z.number().int().positive().optional(),
  fields: z.array(formFieldInputSchema).max(80).optional(),
  style: formStyleInputSchema.optional(),
  submit_button_label: z.string().min(1).max(80).optional(),
  success_message: z.string().min(1).max(1000).optional(),
  confirmation_message: z.string().min(1).max(5000).optional(),
  confirm: z.boolean().optional(),
});

type FormStyleRow = { theme?: string; background?: string; textColor?: string; accentColor?: string; borderRadius?: string };

function mergeStyle(current: FormStyleRow | null | undefined, patch: z.infer<typeof formStyleInputSchema> | undefined) {
  return {
    theme: patch?.theme ?? current?.theme,
    background: patch?.background ?? current?.background,
    textColor: patch?.text_color ?? current?.textColor,
    accentColor: patch?.accent_color ?? current?.accentColor,
    borderRadius: patch?.border_radius ?? current?.borderRadius,
  };
}

function normalizeFields(fields: z.infer<typeof formFieldInputSchema>[]) {
  return fields.map((field) => ({ ...field, id: field.id ?? field.key }));
}

/**
 * Sin instance_id: si el equipo tiene UNA instancia se usa esa; con varias se
 * exige elegir, porque la instancia decide desde qué número sale la confirmación.
 */
async function resolveInstanceId(teamId: number, explicit: number | undefined) {
  if (explicit) return explicit;
  const rows = await db
    .select({ id: evolutionInstances.id, name: evolutionInstances.instanceName })
    .from(evolutionInstances)
    .where(eq(evolutionInstances.teamId, teamId));
  if (rows.length === 1) return rows[0].id;
  if (!rows.length) throw new Error('El equipo no tiene ninguna instancia de WhatsApp: el formulario necesita una para mandar la confirmación.');
  throw new Error(`instance_id es obligatorio: el equipo tiene ${rows.length} instancias (${rows.map((row) => `${row.id}=${row.name}`).join(', ')}).`);
}

async function publicFormUrl(publicId: string) {
  const base = await getBaseUrl();
  return `${base}/es/forms/${publicId}`;
}

async function manageForm(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'formBuilderWrite', FORM_BUILDER_PLUGIN);
  const data = parse(manageFormSchema, input);

  if (data.action === 'delete') {
    if (!data.form_id) throw new Error('form_id es obligatorio para delete.');
    if (data.confirm !== true) throw new Error('confirm debe ser true: borrar el formulario borra también todos sus envíos y no se deshace.');
    const removed = await deleteForm(context.teamId, data.form_id);
    if (!removed) throw new Error('Form not found');
    await audit(context, 'CONNECTOR_FORM_DELETED', data.form_id);
    return { success: true, action: 'delete', form_id: data.form_id };
  }

  if (data.action === 'create') {
    if (!data.name) throw new Error('name es obligatorio para create.');
    if (!data.fields) throw new Error('fields es obligatorio para create (puede ser una lista vacía sólo en status="draft").');
    const formInput = parse(formBuilderFormInputSchema, {
      name: data.name,
      description: data.description ?? null,
      slug: data.slug ?? null,
      status: data.status ?? 'draft',
      instanceId: await resolveInstanceId(context.teamId, data.instance_id),
      fields: normalizeFields(data.fields),
      style: mergeStyle(null, data.style),
      submitButtonLabel: data.submit_button_label,
      successMessage: data.success_message,
      confirmationMessage: data.confirmation_message,
    });
    const created = await createForm(context.teamId, context.userId, formInput);
    await audit(context, 'CONNECTOR_FORM_CREATED', created.id);
    return {
      success: true,
      action: 'create',
      form: created,
      public_url: await publicFormUrl(created.publicId),
      published: created.status === 'published',
    };
  }

  if (!data.form_id) throw new Error('form_id es obligatorio para update.');
  const existing = await getFormWithInstanceForTeam(data.form_id, context.teamId);
  if (!existing) throw new Error('Form not found');
  const current = existing.form;

  // updateForm reemplaza el formulario entero (es lo que manda la pantalla):
  // la edición parcial se arma acá sobre lo guardado.
  const formInput = parse(formBuilderFormInputSchema, {
    name: data.name ?? current.name,
    description: data.description !== undefined ? data.description : current.description,
    slug: data.slug !== undefined ? data.slug : current.slug,
    status: data.status ?? current.status,
    instanceId: data.instance_id ?? current.instanceId,
    fields: data.fields ? normalizeFields(data.fields) : current.fields,
    style: mergeStyle(current.style as FormStyleRow, data.style),
    submitButtonLabel: data.submit_button_label ?? current.submitButtonLabel,
    successMessage: data.success_message ?? current.successMessage,
    confirmationMessage: data.confirmation_message ?? current.confirmationMessage,
  });
  const updated = await updateForm(context.teamId, context.userId, data.form_id, formInput);
  await audit(context, 'CONNECTOR_FORM_UPDATED', updated.id);
  return {
    success: true,
    action: 'update',
    form: updated,
    public_url: await publicFormUrl(updated.publicId),
    published: updated.status === 'published',
  };
}

const submissionStatusInputSchema = z.object({
  submission_id: z.number().int().positive(),
  status: submissionStatusSchema,
});

async function formSubmissionStatus(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'formBuilderWrite', FORM_BUILDER_PLUGIN);
  const data = parse(submissionStatusInputSchema, input);
  const updated = await setSubmissionStatus(context.teamId, context.userId, data.submission_id, data.status);
  await audit(context, 'CONNECTOR_FORM_SUBMISSION_STATUS', updated.id);
  return {
    success: true,
    submission: {
      id: updated.id,
      form_id: updated.formId,
      status: updated.status,
      reviewed_by: updated.reviewedBy,
      reviewed_at: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
    },
  };
}

export async function executeContentTool(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (name === 'whatspro_manage_draft') return manageDraft(input, context);
  if (name === 'whatspro_drafts_generate') return draftsGenerate(input, context);
  if (name === 'whatspro_manage_form') return manageForm(input, context);
  if (name === 'whatspro_form_submission_status') return formSubmissionStatus(input, context);
  throw new Error(`Unknown content tool: ${name}`);
}
