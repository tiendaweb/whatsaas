import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, chats, contactTags, contacts, customFields, funnelStages, tags, teamCommercialAnalysis } from '@/lib/db/schema';
import { isNotNull } from 'drizzle-orm';
import type { CrmFix } from '../shared/crm-fix';

/**
 * Pestaña CRM de la ficha: leer y escribir lo que define al contacto.
 *
 * Antes esto estaba partido en dos pestañas de sólo lectura ("Campos" y
 * "Notas") y la etapa del embudo ni siquiera se veía: para cambiar una etiqueta
 * había que salir del Command Center, abrir el chat en WhatsPro y volver. Como
 * son el mismo objeto —qué sabemos de este cliente— van juntos y son editables.
 *
 * Dos reglas que se sostienen:
 *  - Una clave de campo personalizado que no esté definida en `custom_fields`
 *    sólo se acepta para BORRARLA. Escribir claves nuevas desde acá llenaría
 *    `custom_data` de campos fantasma que después no se ven en ningún lado.
 *  - Las etiquetas se reemplazan por conjunto, no se parchean: el editor manda
 *    la lista final, y así sacar una etiqueta es tan posible como agregarla.
 */

export type CrmField = { key: string; name: string; type: string; value: string };

export type CrmPayload = {
  contactId: number | null;
  name: string;
  notes: string | null;
  funnelStageId: number | null;
  stages: Array<{ id: number; name: string; emoji: string | null }>;
  tagIds: number[];
  allTags: Array<{ id: number; name: string; color: string | null }>;
  fields: CrmField[];
  /** Valores de `custom_data` cuya definición ya no existe: sólo se pueden borrar. */
  orphanFields: Array<{ key: string; value: string }>;
};

function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata, ipAddress: null });
  } catch (error) {
    console.error('[sales-ops/crm] audit', error);
  }
}

/** Resuelve el contacto de un chat del equipo. `null` = el chat no tiene ficha de contacto. */
async function contactForChat(teamId: number, chatId: number) {
  const chat = await db.query.chats.findFirst({ where: and(eq(chats.teamId, teamId), eq(chats.id, chatId)), columns: { id: true } });
  if (!chat) return null;
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.teamId, teamId), eq(contacts.chatId, chatId)),
    columns: { id: true, name: true, notes: true, funnelStageId: true, customData: true },
  });
  return contact ?? null;
}

export async function getCrm(teamId: number, chatId: number): Promise<CrmPayload | null> {
  const contact = await contactForChat(teamId, chatId);

  const [stageRows, tagRows, fieldRows] = await Promise.all([
    db.select({ id: funnelStages.id, name: funnelStages.name, emoji: funnelStages.emoji }).from(funnelStages).where(eq(funnelStages.teamId, teamId)).orderBy(asc(funnelStages.order)),
    db.select({ id: tags.id, name: tags.name, color: tags.color }).from(tags).where(eq(tags.teamId, teamId)).orderBy(asc(tags.name)),
    db.select({ key: customFields.key, name: customFields.name, type: customFields.type }).from(customFields).where(eq(customFields.teamId, teamId)).orderBy(asc(customFields.position)),
  ]);

  if (!contact) {
    // El chat existe pero no tiene contacto: se muestra el catálogo vacío para
    // que la pantalla explique por qué no hay nada que editar.
    return { contactId: null, name: '', notes: null, funnelStageId: null, stages: stageRows, tagIds: [], allTags: tagRows, fields: [], orphanFields: [] };
  }

  const asignadas = await db.select({ tagId: contactTags.tagId }).from(contactTags).where(eq(contactTags.contactId, contact.id));
  const custom = (contact.customData ?? {}) as Record<string, unknown>;
  const conocidas = new Set(fieldRows.map((f) => f.key));

  return {
    contactId: contact.id,
    name: contact.name,
    notes: contact.notes,
    funnelStageId: contact.funnelStageId,
    stages: stageRows,
    tagIds: asignadas.map((t) => t.tagId),
    allTags: tagRows,
    fields: fieldRows.map((f) => ({ key: f.key, name: f.name, type: f.type, value: asText(custom[f.key]) })),
    orphanFields: Object.entries(custom)
      .filter(([key, value]) => !conocidas.has(key) && value != null && value !== '')
      .map(([key, value]) => ({ key, value: asText(value) })),
  };
}

export type CrmPatch = {
  notes?: string | null;
  funnelStageId?: number | null;
  tagIds?: number[];
  /** `{ clave: valor }`. Un valor vacío o `null` borra la clave. */
  fields?: Record<string, string | null>;
};

export class CrmError extends Error {}

export async function updateCrm(teamId: number, userId: number, chatId: number, patch: CrmPatch): Promise<CrmPayload> {
  const contact = await contactForChat(teamId, chatId);
  if (!contact) throw new CrmError('Este chat todavía no tiene una ficha de contacto. Guardalo como contacto antes de editar el CRM.');

  const cambios: Record<string, unknown> = {};

  if (patch.notes !== undefined) cambios.notes = patch.notes?.trim() ? patch.notes.trim().slice(0, 10_000) : null;

  if (patch.funnelStageId !== undefined) {
    if (patch.funnelStageId === null) {
      cambios.funnelStageId = null;
    } else {
      const stage = await db.query.funnelStages.findFirst({ where: and(eq(funnelStages.teamId, teamId), eq(funnelStages.id, patch.funnelStageId)), columns: { id: true } });
      if (!stage) throw new CrmError('Esa etapa no es del equipo.');
      cambios.funnelStageId = stage.id;
    }
  }

  if (patch.fields) {
    const definiciones = await db.select({ key: customFields.key }).from(customFields).where(eq(customFields.teamId, teamId));
    const conocidas = new Set(definiciones.map((d) => d.key));
    const actuales = { ...((contact.customData ?? {}) as Record<string, unknown>) };
    const desconocidas = Object.entries(patch.fields).filter(([key, value]) => !conocidas.has(key) && value != null && String(value).trim() !== '');
    if (desconocidas.length) {
      throw new CrmError(`No existen estos campos personalizados: ${desconocidas.map(([k]) => k).join(', ')}. Creálos en Ajustes → Campos personalizados.`);
    }
    for (const [key, value] of Object.entries(patch.fields)) {
      if (value == null || String(value).trim() === '') delete actuales[key];
      else actuales[key] = String(value).slice(0, 2000);
    }
    cambios.customData = actuales;
  }

  if (Object.keys(cambios).length) {
    cambios.updatedAt = new Date();
    await db.update(contacts).set(cambios).where(and(eq(contacts.id, contact.id), eq(contacts.teamId, teamId)));
  }

  if (patch.tagIds) {
    const ids = Array.from(new Set(patch.tagIds.filter((id) => Number.isInteger(id) && id > 0)));
    const propias = ids.length
      ? await db.select({ id: tags.id }).from(tags).where(and(eq(tags.teamId, teamId), inArray(tags.id, ids)))
      : [];
    const validas = propias.map((t) => t.id);
    // Reemplazo por conjunto: el editor manda la lista final.
    await db.delete(contactTags).where(eq(contactTags.contactId, contact.id));
    if (validas.length) {
      await db.insert(contactTags).values(validas.map((tagId) => ({ contactId: contact.id, tagId })));
    }
  }

  await audit(teamId, userId, 'SALES_OPS_CRM_UPDATED', {
    chatId,
    contactId: contact.id,
    campos: Object.keys(cambios).filter((k) => k !== 'updatedAt'),
    etiquetas: patch.tagIds ? patch.tagIds.length : undefined,
  });

  const payload = await getCrm(teamId, chatId);
  if (!payload) throw new CrmError('No se pudo releer el contacto.');
  return payload;
}

// ── Aplicar la corrección propuesta ─────────────────────────────────────────

export type ApplyCrmFixResult = {
  applied: string[];
  skipped: string[];
  crm: CrmPayload;
};

/**
 * Ejecuta el `crm_fix` que dejó la clasificación.
 *
 * Traduce nombres a ids contra el catálogo del equipo y arma UN patch para
 * `updateCrm`, que es el único camino de escritura del CRM: así la validación
 * de pertenencia al equipo, el reemplazo de etiquetas por conjunto y la
 * auditoría son exactamente los mismos que cuando lo edita una persona a mano.
 *
 * Lo que no existe se saltea y se informa, no rompe: una etiqueta inventada por
 * la IA no puede tirar abajo una corrección que además arreglaba la etapa. La
 * comparación de nombres ignora mayúsculas y acentos, porque "Interesado" y
 * "interesado" son la misma etiqueta para quien la escribió.
 *
 * Al terminar borra la propuesta: ya se aplicó, y un botón que sigue ahí
 * después de apretarlo invita a aplicarla dos veces.
 */
export async function applyCrmFix(teamId: number, userId: number, chatId: number, opts: { fix?: CrmFix } = {}): Promise<ApplyCrmFixResult> {
  const [analysis] = await db
    .select({ id: teamCommercialAnalysis.id, crmFix: teamCommercialAnalysis.crmFix })
    .from(teamCommercialAnalysis)
    .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId)))
    .limit(1);

  // Con `opts.fix` se aplica ESA corrección (la que acaba de proponer
  // "Ejecutar ahora" del Focus y la persona confirmó en pantalla) en vez de la
  // guardada por la clasificación. Pasa por el mismo camino y las mismas
  // validaciones: lo único que cambia es de dónde sale la propuesta.
  const fix = opts.fix ?? (analysis?.crmFix as CrmFix | null | undefined);
  if (!fix) throw new CrmError('Este contacto no tiene una corrección de CRM para aplicar.');

  const actual = await getCrm(teamId, chatId);
  if (!actual) throw new CrmError('No encontramos este chat.');
  if (!actual.contactId) throw new CrmError('Este chat todavía no tiene una ficha de contacto. Guardalo como contacto antes de aplicar la corrección.');

  const applied: string[] = [];
  const skipped: string[] = [];
  const patch: CrmPatch = {};

  if (fix.stage !== undefined) {
    if (fix.stage === null) {
      patch.funnelStageId = null;
      applied.push('Sacado del embudo');
    } else {
      const stage = actual.stages.find((s) => igual(s.name, fix.stage as string));
      if (stage) {
        patch.funnelStageId = stage.id;
        applied.push(`Etapa: ${stage.name}`);
      } else {
        skipped.push(`No existe la etapa “${fix.stage}”`);
      }
    }
  }

  if (fix.addTags?.length || fix.removeTags?.length) {
    const ids = new Set(actual.tagIds);
    for (const nombre of fix.addTags ?? []) {
      const tag = actual.allTags.find((t) => igual(t.name, nombre));
      if (!tag) skipped.push(`No existe la etiqueta “${nombre}”`);
      else if (ids.has(tag.id)) skipped.push(`Ya tenía “${tag.name}”`);
      else {
        ids.add(tag.id);
        applied.push(`+ ${tag.name}`);
      }
    }
    for (const nombre of fix.removeTags ?? []) {
      const tag = actual.allTags.find((t) => igual(t.name, nombre));
      if (!tag) skipped.push(`No existe la etiqueta “${nombre}”`);
      else if (!ids.has(tag.id)) skipped.push(`No tenía “${tag.name}”`);
      else {
        ids.delete(tag.id);
        applied.push(`− ${tag.name}`);
      }
    }
    if (applied.length) patch.tagIds = Array.from(ids);
  }

  if (fix.fields && Object.keys(fix.fields).length) {
    const porClave: Record<string, string | null> = {};
    for (const [nombre, valor] of Object.entries(fix.fields)) {
      // Acepta el nombre visible o la clave interna: el conector puede haber
      // leído cualquiera de los dos en el expediente.
      const campo = actual.fields.find((f) => igual(f.name, nombre) || igual(f.key, nombre));
      if (!campo) {
        skipped.push(`No existe el campo “${nombre}”`);
        continue;
      }
      porClave[campo.key] = valor;
      applied.push(valor == null || valor === '' ? `Borrado ${campo.name}` : `${campo.name}: ${valor}`);
    }
    if (Object.keys(porClave).length) patch.fields = porClave;
  }

  if (!applied.length) {
    throw new CrmError(`No quedó nada para aplicar. ${skipped.join('. ')}`.trim());
  }

  const crm = await updateCrm(teamId, userId, chatId, patch);

  // La propuesta guardada se borra sólo si fue la que se aplicó: una corrección
  // propuesta desde el Focus no tiene por qué pisar la de la clasificación.
  if (!opts.fix && analysis) {
    await db
      .update(teamCommercialAnalysis)
      .set({ crmFix: null, crmToFix: null })
      .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId)));
  }

  await audit(teamId, userId, 'SALES_OPS_CRM_FIX_APPLIED', { chatId, contactId: actual.contactId, applied, skipped, propuesta: fix });

  return { applied, skipped, crm };
}

export type CrmFixPendiente = {
  chatId: number;
  name: string;
  gate: string | null;
  fix: CrmFix;
  texto: string | null;
  analyzedAt: string | null;
};

/**
 * Las correcciones de CRM que dejó la clasificación y nadie aplicó todavía.
 *
 * Antes sólo se veían adentro de la ficha de cada contacto: había que abrirlo
 * para enterarse de que la etapa estaba mal. Como son una decisión pendiente
 * igual que un lote, la Cola las lista en "En revisión" y se aplican o se
 * descartan desde ahí, de a una, sin tocar el CRM en lote.
 */
export async function listCrmFixes(teamId: number, limit = 200): Promise<CrmFixPendiente[]> {
  const rows = await db
    .select({
      chatId: teamCommercialAnalysis.chatId,
      gate: teamCommercialAnalysis.currentGate,
      fix: teamCommercialAnalysis.crmFix,
      texto: teamCommercialAnalysis.crmToFix,
      analyzedAt: teamCommercialAnalysis.analyzedAt,
      chatName: chats.name,
      pushName: chats.pushName,
      remoteJid: chats.remoteJid,
      contactName: contacts.name,
    })
    .from(teamCommercialAnalysis)
    .innerJoin(chats, eq(chats.id, teamCommercialAnalysis.chatId))
    .leftJoin(contacts, and(eq(contacts.chatId, chats.id), eq(contacts.teamId, teamId)))
    .where(and(eq(teamCommercialAnalysis.teamId, teamId), isNotNull(teamCommercialAnalysis.crmFix)))
    .orderBy(sql`${teamCommercialAnalysis.analyzedAt} desc nulls last`)
    .limit(limit);
  return rows
    .filter((r) => r.fix && typeof r.fix === 'object')
    .map((r) => ({
      chatId: r.chatId,
      name: r.contactName?.trim() || r.chatName?.trim() || r.pushName?.trim() || `…${(r.remoteJid || '').replace(/\D/g, '').slice(-4)}`,
      gate: r.gate ?? null,
      fix: r.fix as CrmFix,
      texto: r.texto ?? null,
      analyzedAt: r.analyzedAt ? r.analyzedAt.toISOString() : null,
    }));
}

/** Descarta la corrección propuesta sin aplicarla. Queda auditado qué se descartó. */
export async function dismissCrmFix(teamId: number, userId: number, chatId: number): Promise<{ chatId: number }> {
  const [row] = await db
    .update(teamCommercialAnalysis)
    .set({ crmFix: null, crmToFix: null })
    .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId), isNotNull(teamCommercialAnalysis.crmFix)))
    .returning({ chatId: teamCommercialAnalysis.chatId });
  if (!row) throw new CrmError('Este contacto no tiene una corrección de CRM pendiente.');
  await audit(teamId, userId, 'SALES_OPS_CRM_FIX_DISMISSED', { chatId });
  return { chatId };
}

/** Compara nombres como los compara una persona: sin mayúsculas ni acentos. */
function igual(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) =>
    (v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}

/** Tipos de campo personalizado que el editor sabe dibujar. */
export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

function slugKey(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * Crea una definición de campo personalizado desde la ficha.
 *
 * Sin esto, cargarle a un cliente un dato que el equipo todavía no había
 * definido —"cuándo cobra", "qué sistema usa"— obligaba a salir del Command
 * Center, ir a Ajustes, crear el campo y volver; en la práctica ese dato
 * terminaba en la nota libre, donde ningún prompt lo puede leer como campo.
 *
 * La clave se deriva del nombre porque es lo que después aparece en
 * `contact.customData` y en el expediente que lee la IA: dejarla escribir a
 * mano produce `Fecha Cobro` y `fecha_cobro` conviviendo.
 */
export async function createCustomField(
  teamId: number,
  userId: number,
  input: { name: string; type?: CustomFieldType },
): Promise<{ key: string; name: string; type: string }> {
  const name = input.name.trim().slice(0, 100);
  if (name.length < 2) throw new CrmError('El nombre del campo necesita al menos 2 caracteres.');
  const key = slugKey(name);
  if (!key) throw new CrmError('Ese nombre no genera una clave válida. Usá letras o números.');

  const existente = await db.query.customFields.findFirst({
    where: and(eq(customFields.teamId, teamId), eq(customFields.key, key)),
    columns: { key: true, name: true, type: true },
  });
  if (existente) return existente;

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${customFields.position}), 0)` })
    .from(customFields)
    .where(eq(customFields.teamId, teamId));

  const [row] = await db
    .insert(customFields)
    .values({ teamId, name, key, type: input.type ?? 'text', position: (max ?? 0) + 1 })
    .returning({ key: customFields.key, name: customFields.name, type: customFields.type });

  await audit(teamId, userId, 'SALES_OPS_CUSTOM_FIELD_CREATED', { key: row.key, name: row.name, type: row.type });
  return row;
}
