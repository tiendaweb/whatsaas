import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const intelligenceSettingsSchema = z.object({
  defaultCurrency: z.string().length(3).default('ARS'),
});

const manifest: AppPluginManifest<typeof intelligenceSettingsSchema> = {
  id: 'intelligence',
  displayName: 'Inteligencia',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/intelligence', title: 'Inteligencia', scope: 'dashboard.page' }],
  navItems: [{ label: 'Inteligencia', href: '/plugins/intelligence', icon: 'PieChart', order: 66, requiredPermission: 'intelligence.read' }],
  settingsSchema: intelligenceSettingsSchema,
  featureFlags: [],
};

export default manifest;
