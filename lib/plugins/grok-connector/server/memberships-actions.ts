import 'server-only';

import { z } from 'zod';
import {
  createMembershipCompany,
  deleteMembershipCompany,
  getMembershipCompany,
  membershipCompanyDependents,
  membershipCompanySchema,
  membershipCompanyUpdateSchema,
  updateMembershipCompany,
} from '@/lib/plugins/memberships/server/companies';
import {
  createReminderRule,
  deleteReminderRule,
  getReminderRule,
  MembershipReminderRuleError,
  reminderRuleSchema,
  reminderRuleUpdateSchema,
  updateReminderRule,
} from '@/lib/plugins/memberships/server/reminder-rules';
import { cancelSubscription, MembershipRenewError } from '@/lib/plugins/memberships/server/renew';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/**
 * Escrituras de Membresías que el conector no tenía: las reglas de aviso de
 * vencimiento, las empresas, y la baja de una suscripción.
 *
 * La baja es a propósito NO destructiva (status → cancelled con motivo). La
 * ruta HTTP tiene un DELETE físico, pero desde una IA borrar una suscripción
 * borra también la historia de cobros que la referencia; eso no se expone.
 *
 * Toda la lógica vive en lib/plugins/memberships/server/** y la comparten las
 * rutas de la pantalla: acá sólo hay permisos, validación y auditoría.
 */

export const membershipsActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_manage_membership_reminder_rule',
    description:
      'Crea, edita o borra una REGLA DE AVISO automático de vencimiento de membresías: "N días antes (offset_days negativo) o después (positivo) de que venza una suscripción, mandá este mensaje por WhatsApp o disparé esta automatización". El cron las aplica a las suscripciones activas con fecha de vencimiento. '
      + 'action_type "message" exige message; "automation" exige automation_id (whatspro_list_records resource="automations"). instance_id elige por qué número sale el aviso; sin él, el de siempre. '
      + 'Las reglas existentes se listan con whatspro_list_records(resource="membership-reminder-rules"). delete exige confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        rule_id: { type: 'integer', minimum: 1, description: 'Obligatorio para update y delete.' },
        name: { type: 'string', minLength: 1, maxLength: 150, description: 'Obligatorio en create. Ej. "Aviso 7 días antes".' },
        offset_days: { type: 'integer', minimum: -365, maximum: 365, description: 'Negativo = antes del vencimiento, 0 = el mismo día, positivo = después. Por defecto 0.' },
        action_type: { type: 'string', enum: ['message', 'automation'], description: 'Por defecto "message".' },
        message: { type: 'string', maxLength: 2000, description: 'Texto del aviso. Obligatorio si action_type es "message".' },
        media_url: { type: ['string', 'null'], maxLength: 2000, description: 'Imagen o archivo adjunto al aviso.' },
        automation_id: { type: ['integer', 'null'], minimum: 1, description: 'Obligatorio si action_type es "automation".' },
        instance_id: { type: ['integer', 'null'], minimum: 1, description: 'Instancia de WhatsApp por la que sale el aviso.' },
        is_active: { type: 'boolean', description: 'Una regla inactiva se conserva pero no manda nada.' },
        position: { type: 'integer', minimum: 0, description: 'Orden entre reglas con el mismo offset.' },
        confirm: { type: 'boolean', description: 'Obligatorio en true para delete.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_membership_company',
    description:
      'Crea, edita o borra una EMPRESA de membresías: la marca o negocio bajo la que se venden planes (un equipo puede administrar varias). Los planes (whatspro_manage_membership_plan) y las suscripciones cuelgan de una empresa por company_id. '
      + 'status "archived" la esconde sin perder nada; es la opción recomendada frente a delete. delete exige confirm=true y deja planes y suscripciones sin empresa (no los borra). La empresa sincronizada desde aapp.space no se puede borrar desde acá. '
      + 'Se listan con whatspro_list_records(resource="membership-companies").',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        company_id: { type: 'integer', minimum: 1, description: 'Obligatorio para update y delete.' },
        name: { type: 'string', minLength: 1, maxLength: 200, description: 'Obligatorio en create.' },
        description: { type: 'string', maxLength: 1000 },
        logo_url: { type: ['string', 'null'], maxLength: 2000 },
        website: { type: ['string', 'null'], maxLength: 2000 },
        email: { type: ['string', 'null'], maxLength: 255 },
        phone: { type: ['string', 'null'], maxLength: 80 },
        address: { type: ['string', 'null'], maxLength: 1000 },
        notes: { type: 'string', maxLength: 2000 },
        status: { type: 'string', enum: ['active', 'archived'] },
        position: { type: 'integer', minimum: 0 },
        confirm: { type: 'boolean', description: 'Obligatorio en true para delete.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_membership_cancel',
    description:
      'Da de BAJA una suscripción de membresía: la pasa a status "cancelled" y deja el motivo anotado con la fecha en sus notas. No borra nada: la suscripción sigue visible como cancelada en la pantalla, en Finanzas OS y en los reportes, y su historial de cobros queda intacto. La fecha de vencimiento no se toca. '
      + 'Es irreversible desde acá (para reactivar usá whatspro_update_membership con status "active"), por eso exige confirm=true. Con dry_run ves cómo quedaría. Si ya estaba cancelada, devuelve la suscripción sin cambios. '
      + 'Para renovar usá whatspro_memberships_renew; para cambiar precio, plan o fechas, whatspro_update_membership.',
    inputSchema: {
      type: 'object',
      required: ['subscription_id', 'reason', 'confirm'],
      properties: {
        subscription_id: { type: 'integer', minimum: 1, description: 'Se obtiene con whatspro_list_records(resource="membership-subscriptions") o whatspro_customer_360.' },
        reason: { type: 'string', minLength: 3, maxLength: 500, description: 'Por qué se da de baja (queda en las notas con la fecha). Ej. "El cliente cerró el local".' },
        confirm: { type: 'boolean', const: true, description: 'Obligatorio en true: la baja no se deshace desde esta tool.' },
        dry_run: { type: 'boolean', description: 'Muestra el resultado sin escribir.' },
      },
      additionalProperties: false,
    },
  },
];

export const membershipsReadTools: GrokActionTool[] = [];

// ─── Schemas ─────────────────────────────────────────────────────────────────

const manageReminderRuleSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  rule_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(150).optional(),
  offset_days: z.number().int().min(-365).max(365).optional(),
  action_type: z.enum(['message', 'automation']).optional(),
  message: z.string().max(2000).optional(),
  media_url: z.string().max(2000).nullable().optional(),
  automation_id: z.number().int().positive().nullable().optional(),
  instance_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  confirm: z.boolean().optional(),
});

const manageCompanySchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  company_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  logo_url: z.string().max(2000).nullable().optional(),
  website: z.string().max(2000).nullable().optional(),
  email: z.string().max(255).nullable().optional(),
  phone: z.string().max(80).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['active', 'archived']).optional(),
  position: z.number().int().min(0).optional(),
  confirm: z.boolean().optional(),
});

const cancelSchema = z.object({
  subscription_id: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  confirm: z.literal(true),
  dry_run: z.boolean().optional(),
});

const zodIssues = (error: z.ZodError) => error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');

/** Sólo las claves que vinieron, ya en camelCase: lo que no viaja no se toca. */
function soloPresentes<T extends Record<string, unknown>>(pairs: Array<[keyof T & string, unknown]>) {
  return Object.fromEntries(pairs.filter(([, value]) => value !== undefined)) as Partial<T>;
}

// ─── Implementación ──────────────────────────────────────────────────────────

async function administrarReglaDeAviso(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'membershipsWrite', 'memberships');
  const data = parse(manageReminderRuleSchema, input);

  try {
    if (data.action === 'create') {
      const parsed = reminderRuleSchema.safeParse({
        name: data.name,
        ...soloPresentes([
          ['offsetDays', data.offset_days],
          ['actionType', data.action_type],
          ['message', data.message],
          ['mediaUrl', data.media_url],
          ['automationId', data.automation_id],
          ['instanceId', data.instance_id],
          ['isActive', data.is_active],
          ['position', data.position],
        ]),
      });
      if (!parsed.success) throw new Error(`Regla inválida: ${zodIssues(parsed.error)}`);
      const rule = await createReminderRule(context.teamId, context.userId, parsed.data);
      await audit(context, 'GROK_MEMBERSHIP_REMINDER_RULE_CREATED', rule.id);
      return { success: true, action: 'create', created: true, rule };
    }

    if (!data.rule_id) throw new Error(`rule_id es obligatorio con action="${data.action}".`);
    const existing = await getReminderRule(context.teamId, data.rule_id);
    if (!existing) throw new Error('La regla de aviso no existe en este equipo.');

    if (data.action === 'delete') {
      if (data.confirm !== true) throw new Error(`Borrar la regla "${existing.name}" (${existing.offsetDays} días) exige confirm=true. Si sólo querés pausarla, usá update con is_active=false.`);
      await deleteReminderRule(context.teamId, context.userId, data.rule_id);
      await audit(context, 'GROK_MEMBERSHIP_REMINDER_RULE_DELETED', data.rule_id);
      return { success: true, action: 'delete', deleted: true, rule_id: data.rule_id };
    }

    const parsed = reminderRuleUpdateSchema.safeParse(soloPresentes([
      ['name', data.name],
      ['offsetDays', data.offset_days],
      ['actionType', data.action_type],
      ['message', data.message],
      ['mediaUrl', data.media_url],
      ['automationId', data.automation_id],
      ['instanceId', data.instance_id],
      ['isActive', data.is_active],
      ['position', data.position],
    ]));
    if (!parsed.success) throw new Error(`Regla inválida: ${zodIssues(parsed.error)}`);
    if (Object.keys(parsed.data).length === 0) throw new Error('No hay nada para cambiar: mandá al menos un campo además de rule_id.');
    const rule = await updateReminderRule(context.teamId, context.userId, data.rule_id, parsed.data);
    await audit(context, 'GROK_MEMBERSHIP_REMINDER_RULE_UPDATED', data.rule_id);
    return { success: true, action: 'update', updated: true, rule };
  } catch (error) {
    if (error instanceof MembershipReminderRuleError) throw new Error(error.message);
    throw error;
  }
}

async function administrarEmpresa(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'membershipsWrite', 'memberships');
  const data = parse(manageCompanySchema, input);

  const campos = () => soloPresentes([
    ['name', data.name],
    ['description', data.description],
    ['logoUrl', data.logo_url],
    ['website', data.website],
    ['email', data.email],
    ['phone', data.phone],
    ['address', data.address],
    ['notes', data.notes],
    ['status', data.status],
    ['position', data.position],
  ]);

  if (data.action === 'create') {
    const parsed = membershipCompanySchema.safeParse(campos());
    if (!parsed.success) throw new Error(`Empresa inválida: ${zodIssues(parsed.error)}`);
    const company = await createMembershipCompany(context.teamId, context.userId, parsed.data);
    await audit(context, 'GROK_MEMBERSHIP_COMPANY_CREATED', company.id);
    return { success: true, action: 'create', created: true, company };
  }

  if (!data.company_id) throw new Error(`company_id es obligatorio con action="${data.action}".`);
  const existing = await getMembershipCompany(context.teamId, data.company_id);
  if (!existing) throw new Error('La empresa no existe en este equipo. Listalas con whatspro_list_records(resource="membership-companies").');

  if (data.action === 'delete') {
    if (existing.externalSource === 'aapp_space') {
      throw new Error('Esta empresa está sincronizada desde aapp.space: borrarla rompería la integración. Archivala con status="archived" si no la querés ver.');
    }
    const dependientes = await membershipCompanyDependents(context.teamId, data.company_id);
    if (data.confirm !== true) {
      throw new Error(
        `Borrar la empresa "${existing.name}" dejaría ${dependientes.plans} plan(es) y ${dependientes.subscriptions} suscripción(es) sin empresa. `
        + 'Si es lo que querés, repetí con confirm=true; si no, archivala con status="archived".',
      );
    }
    await deleteMembershipCompany(context.teamId, context.userId, data.company_id);
    await audit(context, 'GROK_MEMBERSHIP_COMPANY_DELETED', data.company_id);
    return { success: true, action: 'delete', deleted: true, company_id: data.company_id, orphaned: dependientes };
  }

  const parsed = membershipCompanyUpdateSchema.safeParse(campos());
  if (!parsed.success) throw new Error(`Empresa inválida: ${zodIssues(parsed.error)}`);
  if (Object.keys(parsed.data).length === 0) throw new Error('No hay nada para cambiar: mandá al menos un campo además de company_id.');
  const company = await updateMembershipCompany(context.teamId, context.userId, data.company_id, parsed.data);
  await audit(context, 'GROK_MEMBERSHIP_COMPANY_UPDATED', data.company_id);
  return { success: true, action: 'update', updated: true, company };
}

async function darDeBaja(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'membershipsWrite', 'memberships');
  const data = parse(cancelSchema, input);
  try {
    const resultado = await cancelSubscription(context.teamId, context.userId, data);
    if (resultado.dryRun) return { success: true, dry_run: true, cancelled: false, preview: resultado.preview };
    if (resultado.idempotent) return { success: true, idempotent: true, cancelled: false, subscription: resultado.subscription, note: 'La suscripción ya estaba cancelada.' };
    await audit(context, 'GROK_MEMBERSHIP_CANCELLED', data.subscription_id);
    return {
      success: true,
      idempotent: false,
      cancelled: true,
      subscription: resultado.subscription,
      note: 'Baja registrada. Si había un cobro pendiente vinculado, revisalo con whatspro_finance_list_entries(subscription_id) y cancelalo con whatspro_finance_update_entry si corresponde.',
    };
  } catch (error) {
    if (error instanceof MembershipRenewError) throw new Error(error.message);
    throw error;
  }
}

export async function executeMembershipsTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
) {
  if (name === 'whatspro_manage_membership_reminder_rule') return administrarReglaDeAviso(input, context);
  if (name === 'whatspro_manage_membership_company') return administrarEmpresa(input, context);
  if (name === 'whatspro_membership_cancel') return darDeBaja(input, context);
  throw new Error(`Unknown memberships tool: ${name}`);
}
