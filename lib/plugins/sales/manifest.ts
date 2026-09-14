import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const salesSettingsSchema = z.object({
  defaultCurrency: z.string().default('USD'),
  taxRate: z.number().default(0),
});

const manifest: AppPluginManifest<typeof salesSettingsSchema> = {
  id: 'sales',
  displayName: 'Ventas',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/sales', title: 'Ventas', scope: 'dashboard.page' },
  ],
  // Sin entrada propia en el menú: se entra por la app Empresa, que es la que
  // agrupa la gestión del negocio. La ruta y los permisos siguen igual, así que
  // los enlaces guardados y los favoritos siguen abriendo esta app.
  navItems: [],
  settingsSchema: salesSettingsSchema,
  featureFlags: [],
};

export default manifest;
