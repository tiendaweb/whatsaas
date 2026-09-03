import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const hrSettingsSchema = z.object({
  defaultCurrency: z.string().length(3).default('ARS'),
});

const manifest: AppPluginManifest<typeof hrSettingsSchema> = {
  id: 'hr',
  displayName: 'RRHH',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/hr', title: 'RRHH', scope: 'dashboard.page' }],
  navItems: [{ label: 'RRHH', href: '/plugins/hr', icon: 'UserCog', order: 63, requiredPermission: 'hr.read' }],
  settingsSchema: hrSettingsSchema,
  featureFlags: [],
};

export default manifest;
