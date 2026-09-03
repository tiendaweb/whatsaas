import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const customersSettingsSchema = z.object({});

const manifest: AppPluginManifest<typeof customersSettingsSchema> = {
  id: 'customers',
  displayName: 'Clientes',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/customers', title: 'Clientes', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Clientes', href: '/plugins/customers', icon: 'UserCheck', order: 57, requiredPermission: 'customers.read' },
  ],
  settingsSchema: customersSettingsSchema,
  featureFlags: [],
};

export default manifest;
