import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const salesOpsSettingsSchema = z.object({
  /** Meta de caja de la misión, en USD. */
  cashGoalUsd: z.number().default(1000),
  /** Desde cuándo cuenta la meta (YYYY-MM-DD). */
  missionSince: z.string().default('2026-08-29'),
  /** Unidades de moneda por 1 USD. Provisorio hasta que el equipo lo confirme. */
  fx: z.object({ ARS: z.number().default(1000), PYG: z.number().default(7500) }).default({ ARS: 1000, PYG: 7500 }),
  /** Horas sin proponer un segundo envío al mismo chat. */
  sendCooldownHours: z.number().default(72),
  /**
   * Techo de decisiones. `maxDecisionesVivas` es cuántas filas sin decidir
   * tolera el equipo antes de que el motor deje de proponer; `maxFilasPorLote`
   * corta los lotes al tamaño que se revisa de una sentada; `proposalTtlHours`
   * es lo que vive una propuesta sin que nadie la mire. Ver
   * MAX_DECISIONES_VIVAS en shared/taxonomy.ts.
   */
  maxDecisionesVivas: z.number().int().min(0).default(25),
  maxFilasPorLote: z.number().int().min(1).default(12),
  proposalTtlHours: z.number().int().min(1).default(48),
  /** Visibilidad por membresía (id de team_membership_subscriptions): 'private' se ve sólo en la pestaña Privadas; 'hidden' no se ve. */
  subscriptionVisibility: z.record(z.string(), z.enum(['private', 'hidden'])).default({}),
  /** Visibilidad por cliente/empresa (`customer:{id}` | `company:{id}`). */
  accountVisibility: z.record(z.string(), z.enum(['private', 'hidden'])).default({}),
  /** Chats cuyos audios no se transcriben nunca: no entran a la cola ni a la vista Audios. */
  audioNeverChatIds: z.array(z.number().int().positive()).default([]),
  /** A quién se le piden las transcripciones a mano (id de usuario). null = Noelia por nombre, o el primer owner. */
  audioHumanoUserId: z.number().int().positive().nullable().default(null),
  /** Ítems descartados de la cola de conectores: `until` null = excluido para siempre; con fecha = por esta vez. */
  /** Leads pospuestos: no aparecen en las listas hasta `until`. */
  leadSnoozes: z.array(z.object({ chatId: z.number().int().positive(), until: z.string(), note: z.string().optional(), at: z.string().optional() })).default([]),
  /** Chats excluidos de Respuestas: el radar no les crea señales y no se listan. */
  radarMutedChatIds: z.array(z.number().int().positive()).default([]),
  workQueueSkips: z.array(z.object({ kind: z.string(), key: z.string(), until: z.string().nullable(), label: z.string().optional(), at: z.string().optional() })).default([]),
});

const manifest: AppPluginManifest<typeof salesOpsSettingsSchema> = {
  id: 'sales-ops',
  displayName: 'Command Center',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  // El Studio va primero: `resolvePluginRouteForTeam` se queda con la primera
  // ruta que matchea por prefijo, y `/plugins/sales-ops` matchearía también
  // `/plugins/sales-ops/studio` dejándole el título del Command Center.
  routes: [
    { path: '/plugins/sales-ops/studio', title: 'Prompt Studio', scope: 'dashboard.page' },
    { path: '/plugins/sales-ops', title: 'Command Center', scope: 'dashboard.page' },
  ],
  navItems: [
    {
      label: 'Command Center',
      href: '/plugins/sales-ops',
      icon: 'Radar',
      order: 54,
      requiredPermission: 'sales-ops.read',
    },
    // El Prompt Studio se abre solo, no como una vista del Command Center: es
    // donde se escriben las skills, no donde se opera con clientes.
    {
      label: 'Prompt Studio',
      href: '/plugins/sales-ops/studio',
      icon: 'Wand2',
      order: 55,
      requiredPermission: 'sales-ops.read',
    },
  ],
  settingsSchema: salesOpsSettingsSchema,
  featureFlags: [],
};

export default manifest;
export type SalesOpsSettings = z.infer<typeof salesOpsSettingsSchema>;
