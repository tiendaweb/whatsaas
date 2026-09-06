import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';
import { MODELO_GEMINI_POR_DEFECTO } from '@/lib/gemini/models';

const geminiSettingsSchema = z.object({
  /**
   * Límites del free tier con los que se dibujan las barras. Son editables por
   * key, pero estos son los valores con los que se crea una nueva: Google los
   * cambia sin avisar y no hay forma de consultarlos por API.
   */
  defaultLimitRpm: z.number().default(10),
  defaultLimitRpd: z.number().default(20),
  defaultModel: z.string().default(MODELO_GEMINI_POR_DEFECTO),
  /**
   * Porcentaje de la cuota diaria del banco que NO consumen los procesos
   * automáticos (worker de audios, clasificador por cron). Queda para lo que
   * una persona pide a mano: "Transcribir ahora", "Ejecutar ahora" del Focus,
   * un análisis puntual. Sin reserva, el 2026-09-05 el clasificador se comió
   * los 2.600 pedidos del día antes del mediodía y a la tarde nada respondía.
   */
  reservaDiariaPct: z.number().min(0).max(90).default(30),
  /**
   * Usar el banco para transcribir notas de voz por cron (worker de audios).
   * Apagado, la cuota queda entera para el Command Center (clasificar, Ejecutar
   * ahora, skills) y para lo que una persona pide a mano: "Transcribir ahora"
   * desde la vista Audios sigue funcionando igual.
   */
  transcribirAudios: z.boolean().default(true).describe('Usar Gemini para transcribir audios'),
});

const manifest: AppPluginManifest<typeof geminiSettingsSchema> = {
  id: 'gemini',
  displayName: 'Gemini',
  // 'global' = se activa equipo por equipo desde Admin → Apps. Hoy sólo está
  // encendido en el de noelia@whatspro.uno.
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/gemini', title: 'Gemini', scope: 'dashboard.page' },
  ],
  navItems: [
    {
      label: 'Gemini',
      href: '/plugins/gemini',
      icon: 'Sparkles',
      order: 92,
      requiredPermission: 'gemini.manage',
    },
  ],
  settingsSchema: geminiSettingsSchema,
  featureFlags: [],
};

export default manifest;
