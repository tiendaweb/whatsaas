import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const marketplaceSettingsSchema = z.object({
  featuredFirst: z.boolean().default(true),
});

const manifest: AppPluginManifest<typeof marketplaceSettingsSchema> = {
  id: 'marketplace',
  displayName:  'Marketplace',
  activationMode: 'system',
  scopes: ['dashboard.page'],
  routes: [
    { path: '/plugins/marketplace', title: 'Marketplace', scope: 'dashboard.page' },
    { path: '/plugins/marketplace/app', title: 'Detalle de mejora', scope: 'dashboard.page' },
  ],
  navItems: [],
  settingsSchema: marketplaceSettingsSchema,
  featureFlags: [],
};

export default manifest;
