import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const tasksSettingsSchema = z.object({
  tasksUi: z.enum(['clasico', 'nuevo']).default('nuevo'),
});

const manifest: AppPluginManifest<typeof tasksSettingsSchema> = {
  id: 'tasks',
  displayName: 'Tareas',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/tasks', title: 'Tareas', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Tareas OS', href: '/plugins/tasks', icon: 'CheckSquare', order: 48, requiredPermission: 'tasks.read' },
  ],
  settingsSchema: tasksSettingsSchema,
  featureFlags: [],
};

export default manifest;
