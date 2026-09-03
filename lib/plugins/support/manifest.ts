import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const supportSettingsSchema = z.object({
  defaultCurrency: z.string().length(3).default('ARS'),
});

const manifest: AppPluginManifest<typeof supportSettingsSchema> = {
  id: 'support',
  displayName: 'Soporte',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/support', title: 'Soporte', scope: 'dashboard.page' }],
  navItems: [{ label: 'Soporte', href: '/plugins/support', icon: 'LifeBuoy', order: 64, requiredPermission: 'support.read' }],
  settingsSchema: supportSettingsSchema,
  featureFlags: [],
};

export default manifest;
