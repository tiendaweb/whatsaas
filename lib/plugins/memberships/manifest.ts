import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const membershipsSettingsSchema = z.object({
  defaultCurrency: z.string().default('USD'),
});

const manifest: AppPluginManifest<typeof membershipsSettingsSchema> = {
  id: 'memberships',
  displayName: 'Membresías',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/memberships/subscriptions', title: 'Suscripciones', scope: 'dashboard.page' },
    { path: '/plugins/memberships/plans', title: 'Planes', scope: 'dashboard.page' },
    { path: '/plugins/memberships/companies', title: 'Empresas', scope: 'dashboard.page' },
    { path: '/plugins/memberships', title: 'Membresías', scope: 'dashboard.page' },
  ],
  // Sin entradas propias en el menú: Suscripciones, Planes y Empresas se abren
  // desde la app Empresa, que es la que agrupa la gestión del negocio. Las
  // rutas y los permisos siguen igual, así que los enlaces guardados y los
  // favoritos siguen funcionando.
  navItems: [],
  settingsSchema: membershipsSettingsSchema,
  featureFlags: [],
};

export default manifest;
