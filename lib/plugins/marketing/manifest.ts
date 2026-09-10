import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

/**
 * Marketing: el hub de todo lo que sale hacia afuera.
 *
 * Lo que se pagaba (Meta Ads), lo que se enviaba (difusión de WhatsApp), lo que
 * se publicaba (redes) y lo que capturaba gente (formularios) vivían como
 * cuatro aplicaciones sueltas en el lanzador, sin un lugar donde mirarlas
 * juntas: nadie podía decir cuánto se gastó este mes y cuántos leads entraron
 * sin abrir cuatro pantallas y sumar a mano.
 *
 * Igual que Empresa, **no tiene tablas propias**: lee las que ya existen
 * (`meta_*`, `campaigns`, `social_*`, `form_builder_*`). Cambiar qué se agrupa
 * es editar `SECTORES` en shared/vistas.ts, no migrar la base.
 */
const marketingSettingsSchema = z.object({
  /** Días del panorama del Inicio. El resumen de Meta se calcula sobre esto. */
  rangoDias: z.number().int().min(7).max(180).default(30),
});

const manifest: AppPluginManifest<typeof marketingSettingsSchema> = {
  id: 'marketing',
  displayName: 'Marketing',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/marketing', title: 'Marketing', scope: 'dashboard.page' }],
  navItems: [
    {
      label: 'Marketing',
      order: 54,
      href: '/plugins/marketing',
      icon: 'Megaphone',
      requiredPermission: 'marketing.read',
    },
  ],
  settingsSchema: marketingSettingsSchema,
  featureFlags: [],
};

export default manifest;
export type MarketingSettings = z.infer<typeof marketingSettingsSchema>;
