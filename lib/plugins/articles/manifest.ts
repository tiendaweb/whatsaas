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
  // Sin entrada propia en el menú: se entra por la app Empresa, que es la que
  // agrupa la gestión del negocio. La ruta y los permisos siguen igual, así que
  // los enlaces guardados y los favoritos siguen abriendo esta app.
  navItems: [],
  settingsSchema: articlesSettingsSchema,
  featureFlags: [],
};

export default manifest;
