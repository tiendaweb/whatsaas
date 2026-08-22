import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

// id `documents` y no `notes`: el id `notes` y la etiqueta "Notas" ya están tomados
// por el plugin de notas rápidas / tareas.
const documentsSettingsSchema = z.object({
  defaultFontSize: z.enum(['normal', 'large']).default('normal'),
});

const manifest: AppPluginManifest<typeof documentsSettingsSchema> = {
  id: 'documents',
  displayName: 'Documentos',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/documents', title: 'Documentos', scope: 'dashboard.page' },
    { path: '/plugins/documents/doc', title: 'Documento', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Documentos', href: '/plugins/documents', icon: 'FileStack', order: 44, requiredPermission: 'documents.read' },
  ],
  settingsSchema: documentsSettingsSchema,
  featureFlags: [],
};

export default manifest;
