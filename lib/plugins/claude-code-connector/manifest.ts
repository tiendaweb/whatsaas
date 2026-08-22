import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const settingsSchema = z.object({
  transport: z.enum(['remote-mcp', 'stdio']).default('remote-mcp'),
  readOnly: z.boolean().default(false),
  actions: z.boolean().default(true),
  scope: z.literal('user').default('user'),
});

const manifest: AppPluginManifest<typeof settingsSchema> = {
  id: 'claude-code-connector',
  displayName: 'Claude Code',
  activationMode: 'user',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/claude-code-connector', title: 'Claude Code', scope: 'dashboard.page' }],
  navItems: [{ label: 'Claude Code', href: '/plugins/claude-code-connector', icon: 'Bot', order: 48 }],
  settingsSchema,
  featureFlags: [],
};

export default manifest;
