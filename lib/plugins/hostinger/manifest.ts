import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const hostingerSettingsSchema = z.object({
  autoLinkCustomers: z.boolean().default(true),
});

const manifest: AppPluginManifest<typeof hostingerSettingsSchema> = {
  id: 'hostinger',
  displayName: 'Hostinger',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/hostinger', title: 'Hostinger', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Hostinger', href: '/plugins/hostinger', icon: 'Server', order: 62, requiredPermission: 'hostinger.read' },
  ],
  settingsSchema: hostingerSettingsSchema,
  featureFlags: [],
};

export default manifest;
