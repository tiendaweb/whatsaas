import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const socialPublisherSettingsSchema = z.object({});

const manifest: AppPluginManifest<typeof socialPublisherSettingsSchema> = {
  id: 'social-publisher',
  displayName: 'Publicaciones Sociales',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/social-publisher', title: 'Publicaciones Sociales', scope: 'dashboard.page' },
    { path: '/plugins/social-publisher/new', title: 'Nueva Publicación', scope: 'dashboard.page' },
    { path: '/plugins/social-publisher/settings', title: 'Cuentas Conectadas', scope: 'dashboard.page' },
  ],
  navItems: [
    { label: 'Publicaciones', href: '/plugins/social-publisher', icon: 'Share2', order: 60, requiredPermission: 'social-publisher.read' },
  ],
  settingsSchema: socialPublisherSettingsSchema,
  featureFlags: [],
};

export default manifest;
