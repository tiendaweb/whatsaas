import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const domainsSettingsSchema = z.object({
  defaultView: z.enum(['list', 'calendar']).default('list'),
  notifyDaysBefore: z.number().default(30),
});

const manifest: AppPluginManifest<typeof domainsSettingsSchema> = {
  id: 'domains',
  displayName: 'Gestión de Dominios',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/domains', title: 'Dominios', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Dominios', href: '/plugins/domains', icon: 'Globe', order: 50, requiredPermission: 'domains.read' },
  ],
  settingsSchema: domainsSettingsSchema,
  featureFlags: [],
};

export default manifest;
