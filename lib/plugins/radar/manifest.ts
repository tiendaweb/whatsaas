import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const radarSettingsSchema = z.object({
  scope: z.literal('user').default('user'),
});

const manifest: AppPluginManifest<typeof radarSettingsSchema> = {
  id: 'radar',
  displayName: 'Radar',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/radar', title: 'Radar', scope: 'dashboard.page' }],
  navItems: [{ label: 'Radar', href: '/plugins/radar', icon: 'Radar', order: 47 }],
  settingsSchema: radarSettingsSchema,
  featureFlags: [],
};

export default manifest;
