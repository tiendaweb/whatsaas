import 'server-only';
import { z } from 'zod';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import {
  CrmError,
  applyCrmFix,
  dismissCrmFix,
  getCrm,
  listCrmFixes,
  updateCrm,
} from '@/lib/plugins/sales-ops/server/crm';
import { crmFixSchema, normalizeCrmFix } from '@/lib/plugins/sales-ops/shared/crm-fix';
import { SALES_OPS_PLUGIN_ID } from '@/lib/plugins/sales-ops/shared/taxonomy';

/**
 * El CRM comercial por conector: la ficha y las correcciones que la IA ya dejó
 * propuestas.
 *
 * El circuito estaba cortado en el último paso, igual que le pasaba a la Cola
 * antes de `execute_batch`: quien clasifica un chat puede escribir un `crm_fix`
 * —"esta persona está en Nuevo lead y ya es clienta desde marzo"— pero ese
 * arreglo sólo se podía aplicar apretando un botón en la ficha, de a uno. Al
 * 2026-09-08 hay **126 correcciones esperando** a que alguien abra 126
 * pantallas.
 *
 * Acá se cierra: listarlas, aplicarlas y descartarlas. Más la lectura y la
 * edición de la ficha en una sola llamada, que es lo que hoy obliga a encadenar
 * `change_crm_stage` + `set_contact_tags` + `set_custom_fields` sin poder
 * limpiar una clave huérfana.
 *
 * Dos límites que se mantienen a propósito:
 *
 * 1. **De a un contacto.** No hay aplicación en lote. Una corrección mal
 *    razonada aplicada de a una se arregla; aplicada sobre 126 fichas, no.
 * 2. **`updateCrm` es el único camino de escritura**, también para las
 *    correcciones: misma validación de pertenencia al equipo, mismo reemplazo
 *    de etiquetas y misma auditoría que cuando lo edita una persona.
 *
 * 🚨 `inputSchema` es JSON Schema puro (un zod adentro hace desaparecer la tool
 * en silencio; lo agarra `scripts/verify-connector-tools.mts`).
 */

const chatIdProperty = { type: 'integer', minimum: 1, description: 'Chat del contacto en WhatsApp.' } as const;

export const crmReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_crm_fix_list',
    description:
      'Las fichas de CRM que la clasificación marcó como MAL, con la corrección concreta ya propuesta: qué etapa debería tener, '
      + 'qué etiquetas sumar o sacar y qué campos completar, más el motivo en una línea. Es trabajo ya pensado esperando que alguien lo aplique. '
      + 'Usala para empezar una limpieza del embudo: leé, revisá contra el expediente (whatspro_sales_dossier) y aplicá con whatspro_crm_fix_apply.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Cuántas traer. Default 50.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_crm_commercial_get',
    description:
      'La ficha CRM editable de un chat: notas, etapa actual y catálogo de etapas del equipo, etiquetas puestas y disponibles, '
      + 'campos personalizados con su definición y valor, y los campos HUÉRFANOS (valores cuya definición ya no existe, que sólo se pueden borrar). '
      + 'Es la foto que hay que leer antes de editar: los nombres de etapas, etiquetas y campos que devuelve son los que aceptan las tools de escritura.',
    inputSchema: {
      type: 'object',
      required: ['chat_id'],
      properties: { chat_id: chatIdProperty },
      additionalProperties: false,
    },
  },
];

export const crmActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_crm_fix_apply',
    description:
      'Aplica la corrección de CRM de UN contacto: mueve de etapa, agrega y saca etiquetas y completa campos, todo en una escritura validada. '
      + 'Sin fix, aplica la que dejó la clasificación (la que devuelve whatspro_crm_fix_list). Con fix, aplica la que le pases —por NOMBRE, no por id: '
      + 'el servidor los resuelve y saltea sin fallar lo que no existe en el equipo, así una etiqueta inventada no tumba la corrección de la etapa. '
      + 'Devuelve qué se aplicó y qué se salteó. No existe versión en lote y es a propósito. Con dry_run ves qué haría sin escribir.',
    inputSchema: {
      type: 'object',
      required: ['chat_id'],
      properties: {
        chat_id: chatIdProperty,
        fix: {
          type: 'object',
          description: 'Corrección propia. Si no la pasás, se usa la guardada por la clasificación.',
          properties: {
            stage: { type: ['string', 'null'], maxLength: 120, description: 'Nombre de la etapa. null la saca del embudo.' },
            add_tags: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 60 } },
            remove_tags: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 60 } },
            fields: { type: 'object', description: 'Campos por NOMBRE visible. Valor vacío o null borra la clave.' },
            reason: { type: ['string', 'null'], maxLength: 300 },
          },
          additionalProperties: false,
        },
        dry_run: { type: 'boolean', description: 'true = devuelve la ficha y la corrección sin escribir nada.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_crm_fix_dismiss',
    description:
      'Descarta la corrección de CRM propuesta para un contacto, sin aplicarla. Usala cuando la ficha ya está bien y la clasificación se equivocó: '
      + 'así deja de aparecer en whatspro_crm_fix_list y nadie la vuelve a evaluar. No cambia ningún dato del contacto.',
    inputSchema: {
      type: 'object',
      required: ['chat_id', 'confirm'],
      properties: { chat_id: chatIdProperty, confirm: { type: 'boolean', const: true } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_crm_commercial_update',
    description:
      'Edita la ficha CRM de un chat en UNA llamada: notas, etapa, etiquetas (se reemplaza el conjunto completo) y campos personalizados, '
      + 'incluyendo BORRAR una clave con valor null —lo único que permite limpiar campos huérfanos—. Etapas, etiquetas y campos van por nombre. '
      + 'Leé antes whatspro_crm_commercial_get para saber qué nombres acepta el equipo. Para aplicar lo que ya propuso la IA, usá whatspro_crm_fix_apply.',
    inputSchema: {
      type: 'object',
      required: ['chat_id'],
      properties: {
        chat_id: chatIdProperty,
        notes: { type: ['string', 'null'], maxLength: 10000, description: 'Reemplaza las notas de la ficha. null las vacía.' },
        stage: { type: ['string', 'null'], maxLength: 120, description: 'Nombre de la etapa. null la saca del embudo.' },
        tags: {
          type: 'array', maxItems: 50, items: { type: 'string', maxLength: 60 },
          description: 'Conjunto COMPLETO de etiquetas: lo que no esté acá se quita. Omitilo para no tocarlas.',
        },
        fields: { type: 'object', description: 'Campos por NOMBRE visible. null o vacío borra la clave.' },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
];

const chatSchema = z.object({ chat_id: z.number().int().positive() }).strict();
const listSchema = z.object({ limit: z.number().int().min(1).max(200).optional() }).strict();
const dismissSchema = z.object({ chat_id: z.number().int().positive(), confirm: z.literal(true) }).strict();
const applySchema = z
  .object({
    chat_id: z.number().int().positive(),
    fix: crmFixSchema.optional(),
    dry_run: z.boolean().optional(),
  })
  .strict();
const updateSchema = z
  .object({
    chat_id: z.number().int().positive(),
    notes: z.string().max(10_000).nullable().optional(),
    stage: z.string().trim().max(120).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    fields: z.record(z.string().trim().min(1).max(100), z.string().max(2000).nullable()).optional(),
    dry_run: z.boolean().optional(),
  })
  .strict();

/** Traduce nombres a ids contra el catálogo del equipo. Lo que no existe se dice, no se inventa. */
function resolverNombres(
  crm: Awaited<ReturnType<typeof getCrm>>,
  input: { stage?: string | null; tags?: string[]; fields?: Record<string, string | null> },
) {
  const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const desconocidos: string[] = [];

  let funnelStageId: number | null | undefined;
  if (input.stage !== undefined) {
    if (input.stage === null) funnelStageId = null;
    else {
      const stage = crm?.stages.find((s) => igual(s.name, input.stage as string));
      if (stage) funnelStageId = stage.id;
      else desconocidos.push(`etapa "${input.stage}"`);
    }
  }

  let tagIds: number[] | undefined;
  if (input.tags) {
    tagIds = [];
    for (const nombre of input.tags) {
      const tag = crm?.allTags.find((t) => igual(t.name, nombre));
      if (tag) tagIds.push(tag.id);
      else desconocidos.push(`etiqueta "${nombre}"`);
    }
  }

  let fields: Record<string, string | null> | undefined;
  if (input.fields) {
    fields = {};
    for (const [nombre, valor] of Object.entries(input.fields)) {
      const campo = crm?.fields.find((f) => igual(f.name, nombre) || igual(f.key, nombre));
      const huerfano = crm?.orphanFields.find((f) => igual(f.key, nombre));
      const clave = campo?.key ?? (huerfano ? nombre : null);
      if (clave) fields[clave] = valor;
      else desconocidos.push(`campo "${nombre}"`);
    }
  }

  return { funnelStageId, tagIds, fields, desconocidos };
}

export async function executeCrmTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name === 'whatspro_crm_fix_list') {
    await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
    const data = parse(listSchema, input);
    const pendientes = await listCrmFixes(context.teamId, data.limit ?? 50);
    return {
      success: true,
      total: pendientes.length,
      pendientes,
      note: pendientes.length
        ? 'Aplicá de a una con whatspro_crm_fix_apply {chat_id}. Si la ficha ya estaba bien, whatspro_crm_fix_dismiss.'
        : 'No hay correcciones de CRM pendientes.',
    };
  }

  if (name === 'whatspro_crm_commercial_get') {
    await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
    const data = parse(chatSchema, input);
    const crm = await getCrm(context.teamId, data.chat_id);
    if (!crm) throw new Error('No encontramos este chat en el equipo.');
    return { success: true, ...crm };
  }

  if (name === 'whatspro_crm_fix_apply') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    // Toca la ficha del contacto: hace falta el permiso de contactos, no sólo el del plugin.
    await assertPermission(context, 'contacts');
    const data = parse(applySchema, input);
    const fix = normalizeCrmFix(data.fix);
    try {
      if (data.dry_run) {
        const crm = await getCrm(context.teamId, data.chat_id);
        if (!crm) throw new CrmError('No encontramos este chat.');
        return {
          success: true,
          dry_run: true,
          fix_a_aplicar: fix ?? 'la guardada por la clasificación (no se leyó en dry_run)',
          ficha_actual: { stage: crm.funnelStageId, tags: crm.tagIds, orphan_fields: crm.orphanFields },
          note: 'dry_run: no se escribió nada.',
        };
      }
      const result = await applyCrmFix(context.teamId, context.userId, data.chat_id, fix ? { fix } : {});
      return {
        success: true,
        applied: result.applied,
        skipped: result.skipped,
        crm: result.crm,
        note: result.skipped.length
          ? 'Parte se salteó porque no existe en el equipo: revisá "skipped" antes de darlo por hecho.'
          : 'Corrección aplicada.',
      };
    } catch (error) {
      if (error instanceof CrmError) throw new Error(error.message);
      throw error;
    }
  }

  if (name === 'whatspro_crm_fix_dismiss') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    const data = parse(dismissSchema, input);
    try {
      const result = await dismissCrmFix(context.teamId, context.userId, data.chat_id);
      return { success: true, ...result, note: 'Corrección descartada. La ficha quedó como estaba.' };
    } catch (error) {
      if (error instanceof CrmError) throw new Error(error.message);
      throw error;
    }
  }

  if (name === 'whatspro_crm_commercial_update') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    await assertPermission(context, 'contacts');
    const data = parse(updateSchema, input);
    try {
      const crm = await getCrm(context.teamId, data.chat_id);
      if (!crm) throw new CrmError('No encontramos este chat.');
      const { funnelStageId, tagIds, fields, desconocidos } = resolverNombres(crm, {
        stage: data.stage,
        tags: data.tags,
        fields: data.fields,
      });

      if (data.dry_run) {
        return {
          success: true,
          dry_run: true,
          cambios: { notes: data.notes, funnelStageId, tagIds, fields },
          desconocidos,
          note: 'dry_run: no se escribió nada.',
        };
      }

      const actualizado = await updateCrm(context.teamId, context.userId, data.chat_id, {
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(funnelStageId !== undefined ? { funnelStageId } : {}),
        ...(tagIds !== undefined ? { tagIds } : {}),
        ...(fields !== undefined ? { fields } : {}),
      });
      return {
        success: true,
        crm: actualizado,
        desconocidos,
        note: desconocidos.length
          ? `No existen en el equipo y se ignoraron: ${desconocidos.join(', ')}. Creá lo que falte con whatspro_manage_crm_stage, whatspro_manage_tag o whatspro_manage_custom_field.`
          : 'Ficha actualizada.',
      };
    } catch (error) {
      if (error instanceof CrmError) throw new Error(error.message);
      throw error;
    }
  }

  throw new Error(`crm: tool desconocida ${name}`);
}
