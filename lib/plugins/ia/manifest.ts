import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

/**
 * IA: el cerebro del sistema, en un solo lugar.
 *
 * Estaba todo repartido: el agente en Ajustes, las automatizaciones en su
 * propia pantalla, las funciones que el agente puede llamar adentro de una
 * pestaña de Ajustes, los tres conectores como apps sueltas y el banco de keys
 * de Gemini en otra más. Nadie podía contestar "¿qué está haciendo la IA hoy y
 * con qué cuota?" sin abrir cinco pantallas.
 *
 * Igual que Empresa y Marketing, **no tiene tablas propias**: lee `automations`,
 * `ai_configs`, `ai_tools`, `ai_builtin_tools`, `team_gemini_keys` y las
 * credenciales de los conectores.
 */
const iaSettingsSchema = z.object({});

const manifest: AppPluginManifest<typeof iaSettingsSchema> = {
  id: 'ia',
  displayName: 'IA',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/ia', title: 'IA', scope: 'dashboard.page' }],
  navItems: [
    {
      label: 'IA',
      order: 55,
      href: '/plugins/ia',
      icon: 'Sparkles',
      requiredPermission: 'ia.read',
    },
  ],
  settingsSchema: iaSettingsSchema,
  featureFlags: [],
};

export default manifest;
export type IaSettings = z.infer<typeof iaSettingsSchema>;
