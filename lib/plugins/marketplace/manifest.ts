import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const marketplaceSettingsSchema = z.object({});

const manifest: AppPluginManifest<typeof marketplaceSettingsSchema> = {
  id: 'marketplace',
  displayName: 'Marketplace',
  scopes: ['dashboard.nav', 'dashboard.page', 'admin.settings'],
  routes: [
    { path: '/plugins/marketplace', title: 'Mejoras', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Mejoras', href: '/plugins/marketplace', icon: 'Rocket', order: 50 },
  ],
  settingsSchema: marketplaceSettingsSchema,
  featureFlags: [],
};

export default manifest;
