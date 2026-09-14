import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const financeSettingsSchema = z.object({
  defaultCurrency: z.string().length(3).default('ARS'),
});

const manifest: AppPluginManifest<typeof financeSettingsSchema> = {
  id: 'finance',
  displayName: 'Finanzas OS',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/finance', title: 'Finanzas OS', scope: 'dashboard.page' }],
  // Sin entrada propia en el menú: se entra por la app Empresa, que es la que
  // agrupa la gestión del negocio. La ruta y los permisos siguen igual, así que
  // los enlaces guardados y los favoritos siguen abriendo esta app.
  navItems: [],
  settingsSchema: financeSettingsSchema,
  featureFlags: [],
};

export default manifest;
