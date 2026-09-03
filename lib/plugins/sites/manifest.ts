import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const sitesSettingsSchema = z.object({
  baseDomain: z.string().trim().min(1).default('whatspro.uno'),
});

const manifest: AppPluginManifest<typeof sitesSettingsSchema> = {
  id: 'sites',
  displayName: 'Sitios',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/sites', title: 'Sitios', scope: 'dashboard.page' }],
  navItems: [
    {
      label: 'Sitios',
      href: '/plugins/sites',
      icon: 'PanelsTopLeft',
      order: 46,
      requiredPermission: 'sites.read',
    },
  ],
  settingsSchema: sitesSettingsSchema,
  featureFlags: [],
};

export default manifest;
