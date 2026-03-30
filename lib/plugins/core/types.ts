import { z } from 'zod';

export const pluginScopeSchema = z.enum(['dashboard.nav', 'dashboard.page', 'admin.settings']);
export type PluginScope = z.infer<typeof pluginScopeSchema>;

export const pluginNavItemSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  icon: z.string().optional(),
  order: z.number().int().default(100),
});

export type PluginNavItem = z.infer<typeof pluginNavItemSchema>;

export const pluginRouteSchema = z.object({
  path: z.string().min(1),
  title: z.string().min(1),
  scope: pluginScopeSchema.default('dashboard.page'),
});

export type PluginRoute = z.infer<typeof pluginRouteSchema>;

export type PluginInstallContext = {
  teamId: number;
  actorUserId?: number | null;
  settings: Record<string, unknown>;
};

export type PluginLifecycleHandler = (context: PluginInstallContext) => Promise<void>;

export type AppPluginManifest<TSettings extends z.ZodTypeAny = z.ZodTypeAny> = {
  id: string;
  displayName: string;
  scopes: PluginScope[];
  routes: PluginRoute[];
  navItems: PluginNavItem[];
  settingsSchema: TSettings;
  featureFlags: string[];
  install?: PluginLifecycleHandler;
  uninstall?: PluginLifecycleHandler;
};

export type PluginSettingsInput<TPlugin extends AppPluginManifest> = z.input<TPlugin['settingsSchema']>;
export type PluginSettings<TPlugin extends AppPluginManifest> = z.infer<TPlugin['settingsSchema']>;
