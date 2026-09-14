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
  // Sin entrada propia en el menú: se entra por la app Empresa, que es la que
  // agrupa la gestión del negocio. La ruta y los permisos siguen igual, así que
  // los enlaces guardados y los favoritos siguen abriendo esta app.
  navItems: [],
  settingsSchema: customersSettingsSchema,
  featureFlags: [],
};

export default manifest;
