import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const notesSettingsSchema = z.object({
  defaultView: z.enum(['kanban', 'list']).default('kanban'),
  allowPinnedOnly: z.boolean().default(false),
});

const manifest: AppPluginManifest<typeof notesSettingsSchema> = {
  id: 'notes',
  displayName: 'Team Notes',
  scopes: ['dashboard.nav', 'dashboard.page', 'admin.settings'],
  routes: [
    { path: '/plugins/notes', title: 'Notas de equipo', scope: 'dashboard.page' },
    { path: '/plugins/notes/settings', title: 'Configuración de notas', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Notas', href: '/plugins/notes', icon: 'NotebookText', order: 45, requiredPermission: 'notes.read' },
  ],
  settingsSchema: notesSettingsSchema,
  featureFlags: [],
};

export default manifest;
