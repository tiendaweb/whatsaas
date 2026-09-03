import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';
import { radarAppearanceSchema } from '@/lib/plugins/radar/shared/blocks';

const radarSettingsSchema = z.object({
  scope: z.literal('user').default('user'),
  /**
   * Apariencia de las secciones del menú lateral (icono, etiqueta y tono por
   * equipo), la escribe `server/appearance.ts`. Tiene que estar declarada acá
   * porque `saveTeamPluginState` parsea `settings` con este schema y zod
   * DESCARTA las claves que no estén en el shape: sin esta línea, cualquier
   * guardado desde Admin borraría la apariencia. El `.catch` evita que un
   * override corrupto haga fallar todo el guardado del plugin.
   */
  appearance: radarAppearanceSchema.optional().catch(undefined),
});

const manifest: AppPluginManifest<typeof radarSettingsSchema> = {
  id: 'radar',
  displayName: 'Radar',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/radar', title: 'Radar', scope: 'dashboard.page' }],
  navItems: [{ label: 'Radar', href: '/plugins/radar', icon: 'Radar', order: 47 }],
  settingsSchema: radarSettingsSchema,
  featureFlags: [],
};

export default manifest;
