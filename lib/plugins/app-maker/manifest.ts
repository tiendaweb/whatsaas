import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const appMakerSettingsSchema = z.object({});

const manifest: AppPluginManifest<typeof appMakerSettingsSchema> = {
  id: 'app-maker',
  displayName: 'APP MAKER',
  activationMode: 'system',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/app-maker', title: 'APP MAKER', scope: 'dashboard.page' }],
  navItems: [{ label: 'APP MAKER', href: '/plugins/app-maker', icon: 'Blocks', order: 58, requiredPermission: 'mini-apps.read' }],
  settingsSchema: appMakerSettingsSchema,
  featureFlags: [],
};

export default manifest;
