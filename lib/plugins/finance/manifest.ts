import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const financeSettingsSchema = z.object({
  defaultCurrency: z.string().length(3).default('ARS'),
});

const manifest: AppPluginManifest<typeof financeSettingsSchema> = {
  id: 'finance',
  displayName: 'Finanzas OS',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/finance', title: 'Finanzas OS', scope: 'dashboard.page' }],
  navItems: [{ label: 'Finanzas OS', href: '/plugins/finance', icon: 'BadgeDollarSign', order: 61, requiredPermission: 'finance.read' }],
  settingsSchema: financeSettingsSchema,
  featureFlags: [],
};

export default manifest;
