import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const calendarSettingsSchema = z.object({
  defaultView: z.enum(['month', 'week']).default('month'),
  enforceOverlapValidation: z.boolean().default(false),
});

const manifest: AppPluginManifest<typeof calendarSettingsSchema> = {
  id: 'calendar',
  displayName: 'Team Calendar',
  scopes: ['dashboard.nav', 'dashboard.page', 'admin.settings'],
  routes: [
    { path: '/plugins/calendar', title: 'Calendario del equipo', scope: 'dashboard.page' },
    { path: '/plugins/calendar/settings', title: 'Configuración de calendario', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Calendario', href: '/plugins/calendar', icon: 'CalendarDays', order: 46, requiredPermission: 'calendar.read' },
  ],
  settingsSchema: calendarSettingsSchema,
  featureFlags: [],
};

export default manifest;
