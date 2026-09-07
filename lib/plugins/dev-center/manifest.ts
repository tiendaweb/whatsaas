import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const devCenterSettingsSchema = z.object({
  /** Agente por defecto al crear una misión. */
  defaultAgent: z.enum(['claude', 'codex', 'connector']).default('claude'),
  /** Proyecto por defecto (slug de config/terminal-projects.json). */
  defaultProject: z.string().default('whatspro'),
});

/**
 * Centro de Desarrollo: misiones, biblioteca de prompts y terminales del
 * servidor, en una sola app. Activación POR USUARIO (hoy sólo Noelia): la app
 * no aparece para nadie más, y además cada ruta del servidor vuelve a mirar la
 * lista blanca de las terminales (`isTerminalOperator`). Dos puertas, no una.
 */
const manifest: AppPluginManifest<typeof devCenterSettingsSchema> = {
  id: 'dev-center',
  displayName: 'Centro de Desarrollo',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/dev-center', title: 'Centro de Desarrollo', scope: 'dashboard.page' }],
  navItems: [
    {
      label: 'Centro de Desarrollo',
      href: '/plugins/dev-center',
      icon: 'PanelsTopLeft',
      order: 53,
    },
  ],
  settingsSchema: devCenterSettingsSchema,
  featureFlags: [],
};

export default manifest;
export type DevCenterSettings = z.infer<typeof devCenterSettingsSchema>;
