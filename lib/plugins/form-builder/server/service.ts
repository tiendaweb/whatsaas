import 'server-only';

import { randomUUID } from 'crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  evolutionInstances,
  formBuilderForms,
  formBuilderSubmissions,
  messages,
  type FormBuilderForm,
  type FormBuilderSubmission,
} from '@/lib/db/schema';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { FORM_BUILDER_PLUGIN_ID, type FormBuilderFormInput, type FormField } from './schema';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';

export function normalizeFormSlug(input: string) {
  const slug = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);

  return slug || `form-${Date.now()}`;
}

export function createPublicId() {
  return randomUUID();
}

export function normalizePhoneToJid(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw.includes('@')) return raw;

  const digits = raw.replace(/\D/g, '');
  if (digits.length < 6) return null;

  return `${digits}@s.whatsapp.net`;
}

function valueToText(value: unknown): string {
  if (Array.isArray(value)) return value.map(valueToText).join(', ');
  if (typeof value === 'boolean') return value ? 'Si' : 'No';
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function formatSubmissionData(fields: FormField[], data: Record<string, unknown>) {
  const knownKeys = new Set(fields.map((field) => field.key));
  const orderedLines = fields
    .map((field) => {
      const text = valueToText(data[field.key]);
      return text ? `- ${field.label}: ${text}` : null;
    })
    .filter(Boolean) as string[];

  const extraLines = Object.entries(data)
    .filter(([key]) => !knownKeys.has(key))
    .map(([key, value]) => {
      const text = valueToText(value);
      return text ? `- ${key}: ${text}` : null;
    })
    .filter(Boolean) as string[];

  return [...orderedLines, ...extraLines].join('\n');
}

export function extractContactName(fields: FormField[], data: Record<string, unknown>) {
  const nameField =
    fields.find((field) => ['name', 'nombre', 'full_name', 'fullname'].includes(field.key.toLowerCase())) ??
    fields.find((field) => field.label.toLowerCase().includes('nombre')) ??
    fields.find((field) => field.type === 'text');

  const name = nameField ? valueToText(data[nameField.key]).trim() : '';
  return name || null;
}

export function extractContactPhone(fields: FormField[], data: Record<string, unknown>) {
  const phoneField =
    fields.find((field) => field.type === 'phone') ??
    fields.find((field) => {
      const text = `${field.key} ${field.label}`.toLowerCase();
      return text.includes('telefono') || text.includes('phone') || text.includes('celular') || text.includes('whatsapp');
    });

  if (!phoneField) return null;
  const phone = valueToText(data[phoneField.key]).trim();
  return phone || null;
}

export function validateSubmissionData(fields: FormField[], data: Record<string, unknown>) {
  for (const field of fields) {
    const value = data[field.key];
    const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
    if (field.required && empty) {
      return `${field.label} es requerido.`;
    }
    if (!empty && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
      return `${field.label} debe ser un email valido.`;
    }
    if (!empty && field.type === 'phone' && !normalizePhoneToJid(value)) {
      return `${field.label} debe ser un telefono valido.`;
    }
    if (!empty && field.type === 'number' && Number.isNaN(Number(value))) {
      return `${field.label} debe ser numerico.`;
    }
  }

  return null;
}

export function validateFormDefinition(input: Pick<FormBuilderFormInput, 'fields' | 'status'>) {
  const keys = new Set<string>();
  for (const field of input.fields) {
    if (keys.has(field.key)) {
      return `La key "${field.key}" esta duplicada.`;
    }
    keys.add(field.key);

    if (field.type === 'select' && field.options.length === 0) {
      return `El campo "${field.label}" necesita opciones.`;
    }
  }

  if (input.status === 'published') {
    if (input.fields.length === 0) {
      return 'Un formulario publicado necesita al menos un campo.';
    }
    const hasPhoneField = input.fields.some((field) => {
      const text = `${field.key} ${field.label}`.toLowerCase();
      return field.type === 'phone' || text.includes('telefono') || text.includes('phone') || text.includes('celular') || text.includes('whatsapp');
    });
    if (!hasPhoneField) {
      return 'Un formulario publicado necesita un campo de telefono para enviar la confirmacion.';
    }
  }

  return null;
}

export function renderConfirmationMessage(params: {
  form: Pick<FormBuilderForm, 'name' | 'confirmationMessage' | 'fields'>;
  submission: Pick<FormBuilderSubmission, 'contactName' | 'contactPhone' | 'data'>;
}) {
  const fields = (params.form.fields ?? []) as FormField[];
  const data = (params.submission.data ?? {}) as Record<string, unknown>;
  const dataBlock = formatSubmissionData(fields, data);
  const replacements: Record<string, string> = {
    formulario: params.form.name,
    nombre: params.submission.contactName ?? '',
    telefono: params.submission.contactPhone ?? '',
    datos: dataBlock,
  };

  for (const field of fields) {
    replacements[field.key] = valueToText(data[field.key]);
  }

  return params.form.confirmationMessage.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return replacements[key] ?? '';
  });
}

export async function isFormBuilderActiveForTeam(teamId: number) {
  const activePlugins = await resolveActivePluginsForTeam(teamId);
  return activePlugins.some((plugin) => plugin.pluginId === FORM_BUILDER_PLUGIN_ID);
}

export async function getFormWithInstanceForTeam(formId: number, teamId: number) {
  const [row] = await db
    .select({
      form: formBuilderForms,
      instanceName: evolutionInstances.instanceName,
      instanceAccessToken: evolutionInstances.accessToken,
    })
    .from(formBuilderForms)
    .leftJoin(evolutionInstances, eq(formBuilderForms.instanceId, evolutionInstances.id))
    .where(and(eq(formBuilderForms.id, formId), eq(formBuilderForms.teamId, teamId)))
    .limit(1);

  return row ?? null;
}

export async function listFormsForTeam(teamId: number) {
  const rows = await db
    .select({
      form: formBuilderForms,
      instanceName: evolutionInstances.instanceName,
      submissionCount: sql<number>`count(${formBuilderSubmissions.id})::int`,
    })
    .from(formBuilderForms)
    .leftJoin(evolutionInstances, eq(formBuilderForms.instanceId, evolutionInstances.id))
    .leftJoin(formBuilderSubmissions, eq(formBuilderSubmissions.formId, formBuilderForms.id))
    .where(eq(formBuilderForms.teamId, teamId))
    .groupBy(formBuilderForms.id, evolutionInstances.instanceName)
    .orderBy(desc(formBuilderForms.updatedAt));

  return rows.map((row) => ({ ...row.form, instanceName: row.instanceName, submissionCount: row.submissionCount }));
}

export async function assertInstanceBelongsToTeam(instanceId: number, teamId: number) {
  const instance = await db.query.evolutionInstances.findFirst({
    where: and(eq(evolutionInstances.id, instanceId), eq(evolutionInstances.teamId, teamId)),
    columns: { id: true },
  });

  return Boolean(instance);
}

export async function makeUniqueSlug(teamId: number, desiredSlug: string, currentFormId?: number) {
  const base = normalizeFormSlug(desiredSlug);
  const candidates = [base, ...Array.from({ length: 50 }, (_, index) => `${base}-${index + 2}`)];

  const existing = await db
    .select({ id: formBuilderForms.id, slug: formBuilderForms.slug })
    .from(formBuilderForms)
    .where(and(eq(formBuilderForms.teamId, teamId), inArray(formBuilderForms.slug, candidates)));

  const used = new Set(existing.filter((row) => row.id !== currentFormId).map((row) => row.slug));
  return candidates.find((candidate) => !used.has(candidate)) ?? `${base}-${Date.now()}`;
}

export async function sendSubmissionConfirmation(submissionId: number) {
  const submission = await db.query.formBuilderSubmissions.findFirst({
    where: eq(formBuilderSubmissions.id, submissionId),
  });

  if (!submission) {
    throw new Error('Submission not found.');
  }

  const form = await db.query.formBuilderForms.findFirst({
    where: and(eq(formBuilderForms.id, submission.formId), eq(formBuilderForms.teamId, submission.teamId)),
  });

  if (!form) {
    throw new Error('Form not found.');
  }

  const instanceId = form.instanceId ?? submission.instanceId;
  if (!instanceId) {
    await markSubmissionMessageError(submission.id, 'El formulario no tiene instancia configurada.');
    return { ok: false, error: 'El formulario no tiene instancia configurada.' };
  }

  const instance = await db.query.evolutionInstances.findFirst({
    where: and(eq(evolutionInstances.id, instanceId), eq(evolutionInstances.teamId, submission.teamId)),
  });

  if (!instance?.instanceName || !instance.accessToken) {
    await markSubmissionMessageError(submission.id, 'La instancia no esta conectada o no tiene token.');
    return { ok: false, error: 'La instancia no esta conectada o no tiene token.' };
  }

  if (!submission.contactJid) {
    await markSubmissionMessageError(submission.id, 'El envio no tiene telefono de contacto valido.');
    return { ok: false, error: 'El envio no tiene telefono de contacto valido.' };
  }

  const text = renderConfirmationMessage({ form, submission });
  const number = submission.contactJid.replace('@s.whatsapp.net', '').replace('@g.us', '');

  try {
    const evolutionResponse = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance.instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: instance.accessToken,
      },
      body: JSON.stringify({ number, text }),
      signal: AbortSignal.timeout(10000),
    });

    const evolutionData = (await evolutionResponse.json().catch(() => ({}))) as any;
    if (!evolutionResponse.ok) {
      const message = evolutionData?.message || evolutionData?.error || 'No se pudo enviar el mensaje.';
      await markSubmissionMessageError(submission.id, message);
      return { ok: false, error: message };
    }

    const messageId = evolutionData?.key?.id ?? `form_builder_${submission.id}_${Date.now()}`;
    await saveOutgoingMessage({
      teamId: submission.teamId,
      instanceId: instance.id,
      remoteJid: submission.contactJid,
      text,
      messageId,
    });

    await db
      .update(formBuilderSubmissions)
      .set({
        messageStatus: 'sent',
        messageId,
        messageError: null,
        updatedAt: new Date(),
      })
      .where(eq(formBuilderSubmissions.id, submission.id));

    return { ok: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo enviar el mensaje.';
    await markSubmissionMessageError(submission.id, message);
    return { ok: false, error: message };
  }
}

async function markSubmissionMessageError(submissionId: number, message: string) {
  await db
    .update(formBuilderSubmissions)
    .set({
      messageStatus: 'error',
      messageError: message,
      updatedAt: new Date(),
    })
    .where(eq(formBuilderSubmissions.id, submissionId));
}

async function saveOutgoingMessage(input: {
  teamId: number;
  instanceId: number;
  remoteJid: string;
  text: string;
  messageId: string;
}) {
  await db.transaction(async (tx) => {
    let chat = await tx.query.chats.findFirst({
      where: and(
        eq(chats.teamId, input.teamId),
        eq(chats.instanceId, input.instanceId),
        eq(chats.remoteJid, input.remoteJid),
      ),
      columns: { id: true },
    });

    if (!chat) {
      const [created] = await tx
        .insert(chats)
        .values({
          teamId: input.teamId,
          remoteJid: input.remoteJid,
          instanceId: input.instanceId,
          name: input.remoteJid.split('@')[0],
          lastMessageText: input.text,
          lastMessageTimestamp: new Date(),
          lastMessageFromMe: true,
          unreadCount: 0,
          lastMessageStatus: 'sent',
        })
        .returning({ id: chats.id });
      chat = created;
    } else {
      await tx
        .update(chats)
        .set({
          lastMessageText: input.text,
          lastMessageTimestamp: new Date(),
          lastMessageFromMe: true,
          unreadCount: 0,
          lastMessageStatus: 'sent',
        })
        .where(eq(chats.id, chat.id));
    }

    await tx
      .insert(messages)
      .values({
        id: input.messageId,
        chatId: chat.id,
        fromMe: true,
        messageType: 'conversation',
        text: input.text,
        timestamp: new Date(),
        status: 'sent',
        isInternal: false,
      })
      .onConflictDoNothing();
  });
}

/* ------------------------------------------------------------------ */
/* Escritura de formularios y envíos                                   */
/*                                                                     */
/* Compartida entre las routes de la pantalla y el conector MCP: la    */
/* route traduce el status; el conector sólo necesita el mensaje.       */
/* ------------------------------------------------------------------ */

export class FormBuilderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function assertFormInput(teamId: number, input: FormBuilderFormInput) {
  const definitionError = validateFormDefinition(input);
  if (definitionError) throw new FormBuilderError(definitionError);

  const instanceOk = await assertInstanceBelongsToTeam(input.instanceId, teamId);
  if (!instanceOk) throw new FormBuilderError('La instancia no pertenece a este team.');
}

export async function createForm(teamId: number, userId: number, input: FormBuilderFormInput) {
  await assertFormInput(teamId, input);

  const slug = await makeUniqueSlug(teamId, input.slug || input.name);
  const [created] = await db
    .insert(formBuilderForms)
    .values({
      teamId,
      instanceId: input.instanceId,
      publicId: createPublicId(),
      slug,
      name: input.name,
      description: input.description ?? null,
      status: input.status,
      fields: input.fields,
      style: input.style,
      submitButtonLabel: input.submitButtonLabel,
      successMessage: input.successMessage,
      confirmationMessage: input.confirmationMessage,
      createdBy: userId,
      updatedBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

/** Reemplazo completo: `input` ya viene entero (la UI manda el formulario completo). */
export async function updateForm(teamId: number, userId: number, formId: number, input: FormBuilderFormInput) {
  const existing = await db.query.formBuilderForms.findFirst({
    where: and(eq(formBuilderForms.id, formId), eq(formBuilderForms.teamId, teamId)),
    columns: { id: true },
  });
  if (!existing) throw new FormBuilderError('Not found', 404);

  await assertFormInput(teamId, input);

  const slug = await makeUniqueSlug(teamId, input.slug || input.name, formId);
  const [updated] = await db
    .update(formBuilderForms)
    .set({
      instanceId: input.instanceId,
      slug,
      name: input.name,
      description: input.description ?? null,
      status: input.status,
      fields: input.fields,
      style: input.style,
      submitButtonLabel: input.submitButtonLabel,
      successMessage: input.successMessage,
      confirmationMessage: input.confirmationMessage,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(formBuilderForms.id, formId), eq(formBuilderForms.teamId, teamId)))
    .returning();

  return updated;
}

/** Borra el formulario y, por cascada, sus envíos. Devuelve cuántas filas se fueron (0 = no existía). */
export async function deleteForm(teamId: number, formId: number) {
  const deleted = await db
    .delete(formBuilderForms)
    .where(and(eq(formBuilderForms.id, formId), eq(formBuilderForms.teamId, teamId)))
    .returning({ id: formBuilderForms.id });
  return deleted.length;
}

export type SubmissionStatus = 'new' | 'in_review' | 'managed' | 'archived';

/** Cambia el estado de revisión de un envío. Volver a `new` limpia quién lo revisó. */
export async function setSubmissionStatus(teamId: number, userId: number, submissionId: number, status: SubmissionStatus) {
  const [updated] = await db
    .update(formBuilderSubmissions)
    .set({
      status,
      reviewedBy: userId,
      reviewedAt: status === 'new' ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(formBuilderSubmissions.id, submissionId), eq(formBuilderSubmissions.teamId, teamId)))
    .returning();

  if (!updated) throw new FormBuilderError('Not found', 404);
  return updated;
}
