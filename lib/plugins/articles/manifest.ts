import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const articlesSettingsSchema = z.object({
  defaultCurrency: z.string().default('USD'),
});

const manifest: AppPluginManifest<typeof articlesSettingsSchema> = {
  id: 'articles',
  displayName: 'Artículos',
  // Keep the app enabled at team level while allowing an explicit member
  // override to hide it for selected users without deleting shared data.
  activationMode: 'hybrid',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/articles', title: 'Artículos', scope: 'dashboard.page' },
    { path: '/plugins/articles/types', title: 'Tipos de Artículo', scope: 'dashboard.page' },
    { path: '/plugins/articles/attributes', title: 'Atributos reutilizables', scope: 'dashboard.page' },
    { path: '/plugins/articles/new', title: 'Nuevo artículo', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Artículos', href: '/plugins/articles', icon: 'Package', order: 55, requiredPermission: 'articles.read' },
  ],
  settingsSchema: articlesSettingsSchema,
  featureFlags: [],
};

export default manifest;
