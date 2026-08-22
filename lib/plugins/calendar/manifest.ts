import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const calendarSettingsSchema = z.object({
  defaultView: z.enum(['calendar', 'gantt']).default('calendar'),
  calendarSubView: z.enum(['month', 'week']).default('month'),
});

const manifest: AppPluginManifest<typeof calendarSettingsSchema> = {
  id: 'calendar',
  displayName: 'Calendario de tareas',
  activationMode: 'global',
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
