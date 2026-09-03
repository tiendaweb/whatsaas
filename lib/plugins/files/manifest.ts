import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const filesSettingsSchema = z.object({});

const manifest: AppPluginManifest<typeof filesSettingsSchema> = {
  id: 'files',
  displayName: 'Archivos',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/files', title: 'Archivos', scope: 'dashboard.page' }],
  navItems: [
    {
      label: 'Archivos',
      href: '/plugins/files',
      icon: 'Files',
      order: 45,
      requiredPermission: 'files.read',
    },
  ],
  settingsSchema: filesSettingsSchema,
  featureFlags: [],
};

export default manifest;
