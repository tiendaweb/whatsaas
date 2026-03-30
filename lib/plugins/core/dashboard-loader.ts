import { resolveActivePluginsForTeam } from './registry';

export async function resolvePluginRouteForTeam(teamId: number, path: string) {
  const plugins = await resolveActivePluginsForTeam(teamId);

  for (const plugin of plugins) {
    const route = plugin.manifest.routes.find((item) => item.path === path);
    if (route) {
      return { plugin, route };
    }
  }

  return null;
}
