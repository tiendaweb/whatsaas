import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

// id `meta-ads` y no `campaigns`: ya existe la feature de Campañas de WhatsApp
// (/campaigns, permiso `campaigns`).
const metaAdsSettingsSchema = z.object({
  defaultRangeDays: z.number().int().min(7).max(365).default(30),
  autoSync: z.boolean().default(true),
});

const manifest: AppPluginManifest<typeof metaAdsSettingsSchema> = {
  id: 'meta-ads',
  displayName: 'Meta Ads',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/meta-ads', title: 'Meta Ads', scope: 'dashboard.page' },
    { path: '/plugins/meta-ads/cuentas', title: 'Cuentas y ajustes', scope: 'dashboard.page' },
    { path: '/plugins/meta-ads/campana', title: 'Campaña', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Meta Ads', href: '/plugins/meta-ads', icon: 'Megaphone', order: 63, requiredPermission: 'meta-ads.read' },
  ],
  settingsSchema: metaAdsSettingsSchema,
  featureFlags: [],
};

export default manifest;
