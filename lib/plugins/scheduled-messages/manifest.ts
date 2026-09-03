import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const scheduledMessagesSettingsSchema = z.object({});

const manifest: AppPluginManifest<typeof scheduledMessagesSettingsSchema> = {
  id: 'scheduled-messages',
  displayName: 'Mensajes Programados',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/scheduled-messages', title: 'Mensajes Programados', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Programados', href: '/plugins/scheduled-messages', icon: 'Clock', order: 58, requiredPermission: 'scheduled-messages.read' },
  ],
  settingsSchema: scheduledMessagesSettingsSchema,
  featureFlags: [],
};

export default manifest;
