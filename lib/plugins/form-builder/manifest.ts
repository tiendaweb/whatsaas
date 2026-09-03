import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const formBuilderSettingsSchema = z.object({});

const manifest: AppPluginManifest<typeof formBuilderSettingsSchema> = {
  id: 'form-builder',
  displayName: 'Formularios',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/form-builder', title: 'Formularios', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Formularios', href: '/plugins/form-builder', icon: 'ClipboardList', order: 61, requiredPermission: 'form-builder.read' },
  ],
  settingsSchema: formBuilderSettingsSchema,
  featureFlags: [],
};

export default manifest;
