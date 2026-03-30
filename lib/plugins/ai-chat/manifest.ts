import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const aiChatSettingsSchema = z.object({
  defaultProvider: z.enum(['openai', 'gemini']).default('openai'),
  maxTokens: z.number().int().min(256).max(8192).default(2048),
});

const manifest: AppPluginManifest<typeof aiChatSettingsSchema> = {
  id: 'ai-chat',
  displayName:  'AI Chat Assistant',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page', 'admin.settings'],
  routes: [
    {
      path: '/plugins/ai-chat',
      title: 'AI Chat Assistant',
      scope: 'dashboard.page',
    },
  ],
  navItems: [
    {
      label: 'AI Chat',
      href: '/plugins/ai-chat',
      icon: 'Bot',
      order: 30,
    },
  ],
  settingsSchema: aiChatSettingsSchema,
  featureFlags: ['isAiEnabled'],
};

export default manifest;
