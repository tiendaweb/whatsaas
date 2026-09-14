import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const dealsSettingsSchema = z.object({
  defaultCurrency: z.string().default('USD'),
  /** `false` deja el cierre sin emitir venta: hay equipos que facturan por fuera. */
  autoCreateSaleOnWin: z.boolean().default(true),
  /** Días sin movimiento a partir de los cuales la tarjeta se marca estancada. */
  staleAfterDays: z.number().default(14),
});

const manifest: AppPluginManifest<typeof dealsSettingsSchema> = {
  id: 'deals',
  displayName: 'Oportunidades',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/deals', title: 'Oportunidades', scope: 'dashboard.page' },
  ],
  // Sin entrada propia en el menú: se entra por la app Empresa, que es la que
  // agrupa la gestión del negocio. La ruta y los permisos siguen igual, así que
  // los enlaces guardados y los favoritos siguen abriendo esta app.
  navItems: [],
  settingsSchema: dealsSettingsSchema,
  featureFlags: [],
};

export default manifest;
