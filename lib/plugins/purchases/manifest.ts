import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const purchasesSettingsSchema = z.object({
  defaultCurrency: z.string().length(3).default('ARS'),
});

const manifest: AppPluginManifest<typeof purchasesSettingsSchema> = {
  id: 'purchases',
  displayName: 'Compras',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/purchases', title: 'Compras', scope: 'dashboard.page' }],
  navItems: [{ label: 'Compras', href: '/plugins/purchases', icon: 'ShoppingCart', order: 62, requiredPermission: 'purchases.read' }],
  settingsSchema: purchasesSettingsSchema,
  featureFlags: [],
};

export default manifest;
