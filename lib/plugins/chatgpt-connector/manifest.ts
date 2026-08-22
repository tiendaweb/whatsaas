import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const settingsSchema = z.object({
  transport: z.literal('remote-mcp').default('remote-mcp'),
  readOnly: z.boolean().default(false),
  actions: z.boolean().default(true),
  scope: z.literal('user').default('user'),
});

const manifest: AppPluginManifest<typeof settingsSchema> = {
  id: 'chatgpt-connector',
  displayName: 'ChatGPT',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/chatgpt-connector', title: 'ChatGPT', scope: 'dashboard.page' }],
  navItems: [{ label: 'ChatGPT', href: '/plugins/chatgpt-connector', icon: 'Bot', order: 49 }],
  settingsSchema,
  featureFlags: [],
};

export default manifest;
