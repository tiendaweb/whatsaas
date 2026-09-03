import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const miniAppsSettingsSchema = z.object({});

const manifest: AppPluginManifest<typeof miniAppsSettingsSchema> = {
  id: 'mini-apps',
  displayName: 'Apps Personalizadas',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/mini-apps', title: 'Apps Personalizadas', scope: 'dashboard.page' },
    { path: '/plugins/mini-apps/business-woman-planner', title: 'Business Woman Planner', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Mis Apps', href: '/plugins/mini-apps', icon: 'LayoutGrid', order: 59, requiredPermission: 'mini-apps.read' },
  ],
  settingsSchema: miniAppsSettingsSchema,
  featureFlags: [],
};

export default manifest;
