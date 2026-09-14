import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const purchasesSettingsSchema = z.object({
  defaultCurrency: z.string().length(3).default('ARS'),
});

const manifest: AppPluginManifest<typeof purchasesSettingsSchema> = {
  id: 'purchases',
  displayName: 'Compras',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/purchases', title: 'Compras', scope: 'dashboard.page' }],
  // Sin entrada propia en el menú: se entra por la app Empresa, que es la que
  // agrupa la gestión del negocio. La ruta y los permisos siguen igual, así que
  // los enlaces guardados y los favoritos siguen abriendo esta app.
  navItems: [],
  settingsSchema: purchasesSettingsSchema,
  featureFlags: [],
};

export default manifest;
