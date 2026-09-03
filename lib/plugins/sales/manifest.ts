import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const salesSettingsSchema = z.object({
  defaultCurrency: z.string().default('USD'),
  taxRate: z.number().default(0),
});

const manifest: AppPluginManifest<typeof salesSettingsSchema> = {
  id: 'sales',
  displayName: 'Ventas',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/sales', title: 'Ventas', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Ventas', href: '/plugins/sales', icon: 'Receipt', order: 56, requiredPermission: 'sales.read' },
  ],
  settingsSchema: salesSettingsSchema,
  featureFlags: [],
};

export default manifest;
