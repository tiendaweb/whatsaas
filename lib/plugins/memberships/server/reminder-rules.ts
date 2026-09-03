import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { automations, evolutionInstances, teamMembershipReminderRules } from '@/lib/db/schema';

/**
 * Reglas de aviso automático de vencimiento de membresías, sin sesión.
 *
 * Cada regla dice "N días antes/después del vencimiento, mandá este mensaje
 * (o disparé esta automatización)". Vivían inline en las rutas de
 * /api/plugins/memberships/reminder-rules; se extraen para que la pantalla y
 * el conector compartan la misma validación (una regla "message" sin texto o
 * "automation" sin automatización no se guarda nunca).
 *
 * Acá NO se chequean permisos: eso es de quien llama. Lo que sí se valida
 * siempre es que la automatización y la instancia sean del equipo.
 */

export class MembershipReminderRuleError extends Error {}

export const reminderRuleSchema = z
  .object({
    name: z.string().min(1).max(150),
    offsetDays: z.number().int().min(-365).max(365).default(0),
    actionType: z.enum(['message', 'automation']).default('message'),
    message: z.string().max(2000).default(''),
    mediaUrl: z.string().max(2000).optional().nullable(),
    automationId: z.number().int().optional().nullable(),
    instanceId: z.number().int().optional().nullable(),
    isActive: z.boolean().default(true),
    position: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.actionType === 'message' && !data.message.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['message'], message: 'El mensaje es requerido.' });
    }
    if (data.actionType === 'automation' && data.automationId == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['automationId'], message: 'Selecciona una automatización.' });
    }
  });
export type ReminderRuleInput = z.infer<typeof reminderRuleSchema>;

export const reminderRuleUpdateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  offsetDays: z.number().int().min(-365).max(365).optional(),
  actionType: z.enum(['message', 'automation']).optional(),
  message: z.string().max(2000).optional(),
  mediaUrl: z.string().max(2000).optional().nullable(),
  automationId: z.number().int().optional().nullable(),
  instanceId: z.number().int().optional().nullable(),
  isActive: z.boolean().optional(),
  position: z.number().int().optional(),
});
export type ReminderRuleUpdateInput = z.infer<typeof reminderRuleUpdateSchema>;

async function assertReferencias(teamId: number, input: { automationId?: number | null; instanceId?: number | null }) {
  if (input.automationId != null) {
    const automation = await db.query.automations.findFirst({
      where: and(eq(automations.id, input.automationId), eq(automations.teamId, teamId)),
      columns: { id: true },
    });
    if (!automation) throw new MembershipReminderRuleError('La automatización no existe en este equipo.');
  }
  if (input.instanceId != null) {
    const instance = await db.query.evolutionInstances.findFirst({
      where: and(eq(evolutionInstances.id, input.instanceId), eq(evolutionInstances.teamId, teamId)),
      columns: { id: true },
    });
    if (!instance) throw new MembershipReminderRuleError('La instancia de WhatsApp no existe en este equipo.');
  }
}

export async function listReminderRules(teamId: number) {
  return db
    .select()
    .from(teamMembershipReminderRules)
    .where(eq(teamMembershipReminderRules.teamId, teamId))
    .orderBy(asc(teamMembershipReminderRules.offsetDays), asc(teamMembershipReminderRules.position));
}

export async function getReminderRule(teamId: number, ruleId: number) {
  return db.query.teamMembershipReminderRules.findFirst({
    where: and(eq(teamMembershipReminderRules.id, ruleId), eq(teamMembershipReminderRules.teamId, teamId)),
  });
}

export async function createReminderRule(teamId: number, _userId: number, d: ReminderRuleInput) {
  await assertReferencias(teamId, d);
  const [created] = await db
    .insert(teamMembershipReminderRules)
    .values({
      teamId,
      name: d.name,
      offsetDays: d.offsetDays,
      actionType: d.actionType,
      message: d.actionType === 'message' ? d.message : '',
      mediaUrl: d.mediaUrl || null,
      automationId: d.actionType === 'automation' ? d.automationId ?? null : null,
      instanceId: d.instanceId ?? null,
      isActive: d.isActive,
      position: d.position ?? 0,
    })
    .returning();
  return created;
}

/** Devuelve null si la regla no es del equipo. */
export async function updateReminderRule(teamId: number, _userId: number, ruleId: number, d: ReminderRuleUpdateInput) {
  const existing = await getReminderRule(teamId, ruleId);
  if (!existing) return null;
  await assertReferencias(teamId, d);

  // La regla resultante tiene que seguir siendo coherente: si queda en
  // "message" necesita texto, si queda en "automation" necesita automatización.
  const actionType = d.actionType ?? existing.actionType;
  const message = d.message ?? existing.message;
  const automationId = d.automationId !== undefined ? d.automationId : existing.automationId;
  if (actionType === 'message' && !message.trim()) throw new MembershipReminderRuleError('Una regla de tipo "message" necesita un mensaje.');
  if (actionType === 'automation' && automationId == null) throw new MembershipReminderRuleError('Una regla de tipo "automation" necesita automation_id.');

  const [updated] = await db
    .update(teamMembershipReminderRules)
    .set({
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.offsetDays !== undefined ? { offsetDays: d.offsetDays } : {}),
      ...(d.actionType !== undefined ? { actionType: d.actionType } : {}),
      ...(d.message !== undefined ? { message: d.message } : {}),
      ...(d.mediaUrl !== undefined ? { mediaUrl: d.mediaUrl || null } : {}),
      ...(d.automationId !== undefined ? { automationId: d.automationId ?? null } : {}),
      ...(d.instanceId !== undefined ? { instanceId: d.instanceId ?? null } : {}),
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
      ...(d.position !== undefined ? { position: d.position } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(teamMembershipReminderRules.id, ruleId), eq(teamMembershipReminderRules.teamId, teamId)))
    .returning();
  return updated ?? null;
}

/** Devuelve false si la regla no es del equipo. */
export async function deleteReminderRule(teamId: number, _userId: number, ruleId: number) {
  const [deleted] = await db
    .delete(teamMembershipReminderRules)
    .where(and(eq(teamMembershipReminderRules.id, ruleId), eq(teamMembershipReminderRules.teamId, teamId)))
    .returning({ id: teamMembershipReminderRules.id });
  return Boolean(deleted);
}
