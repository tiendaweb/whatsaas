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
  navItems: [
    {
      label: 'Oportunidades',
      href: '/plugins/deals',
      icon: 'Handshake',
      // Justo antes de Ventas (56): en el menú se lee el recorrido completo,
      // oportunidad y después venta.
      order: 55,
      requiredPermission: 'deals.read',
    },
  ],
  settingsSchema: dealsSettingsSchema,
  featureFlags: [],
};

export default manifest;
