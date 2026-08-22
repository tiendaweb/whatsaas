import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const settingsSchema = z.object({
  transport: z.literal('remote-mcp').default('remote-mcp'),
  access: z.literal('subscription').default('subscription'),
  readOnly: z.boolean().default(false),
  actions: z.literal(true).default(true),
});

const manifest: AppPluginManifest<typeof settingsSchema> = {
  id: 'grok-connector',
  displayName: 'Conector Grok',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/grok-connector', title: 'Conector Grok', scope: 'dashboard.page' }],
  navItems: [{ label: 'Grok', href: '/plugins/grok-connector', icon: 'Bot', order: 47 }],
  settingsSchema,
  featureFlags: [],
};

export default manifest;
