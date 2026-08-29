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
  /** Visibilidad por membresía (id de team_membership_subscriptions): 'private' se ve sólo en la pestaña Privadas; 'hidden' no se ve. */
  subscriptionVisibility: z.record(z.string(), z.enum(['private', 'hidden'])).default({}),
  /** Visibilidad por cliente/empresa (`customer:{id}` | `company:{id}`). */
  accountVisibility: z.record(z.string(), z.enum(['private', 'hidden'])).default({}),
});

const manifest: AppPluginManifest<typeof salesOpsSettingsSchema> = {
  id: 'sales-ops',
  displayName: 'Command Center',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/sales-ops', title: 'Command Center', scope: 'dashboard.page' }],
  navItems: [
    {
      label: 'Command Center',
      href: '/plugins/sales-ops',
      icon: 'Radar',
      order: 54,
      requiredPermission: 'sales-ops.read',
    },
  ],
  settingsSchema: salesOpsSettingsSchema,
  featureFlags: [],
};

export default manifest;
export type SalesOpsSettings = z.infer<typeof salesOpsSettingsSchema>;
