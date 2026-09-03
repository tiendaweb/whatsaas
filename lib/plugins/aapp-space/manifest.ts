import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const manifest: AppPluginManifest<z.ZodObject<Record<string, never>>> = {
  id: 'aapp-space', displayName: 'AAPP SPACE', activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/aapp-space', title: 'AAPP SPACE', scope: 'dashboard.page' }],
  navItems: [{ label: 'AAPP SPACE', href: '/plugins/aapp-space', icon: 'Store', order: 60, requiredPermission: 'aapp-space.read' }],
  settingsSchema: z.object({}), featureFlags: [],
};
export default manifest;
