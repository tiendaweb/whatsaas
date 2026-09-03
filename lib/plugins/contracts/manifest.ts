import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const contractsSettingsSchema = z.object({
  defaultCurrency: z.string().length(3).default('ARS'),
});

const manifest: AppPluginManifest<typeof contractsSettingsSchema> = {
  id: 'contracts',
  displayName: 'Contratos',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/contracts', title: 'Contratos', scope: 'dashboard.page' }],
  navItems: [{ label: 'Contratos', href: '/plugins/contracts', icon: 'FileSignature', order: 65, requiredPermission: 'contracts.read' }],
  settingsSchema: contractsSettingsSchema,
  featureFlags: [],
};

export default manifest;
