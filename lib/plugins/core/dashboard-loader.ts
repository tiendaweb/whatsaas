import { resolveActivePluginsForTeam } from './registry';
import { resolvePluginPageRenderer, type PluginPageRenderer } from './page-registry';

export type TeamPluginRouteResolution = {
  plugin: Awaited<ReturnType<typeof resolveActivePluginsForTeam>>[number];
  route: Awaited<ReturnType<typeof resolveActivePluginsForTeam>>[number]['manifest']['routes'][number];
  renderer: PluginPageRenderer;
};

function getPluginPath(pluginId: string, slug?: string[]) {
  return `/plugins/${pluginId}${slug?.length ? `/${slug.join('/')}` : ''}`;
}

function matchRoutePath(routePath: string, currentPath: string) {
  return currentPath === routePath || currentPath.startsWith(`${routePath}/`);
}

export async function resolvePluginRouteForTeam(teamId: number, pluginId: string, slug?: string[]): Promise<TeamPluginRouteResolution | null> {
  const plugins = await resolveActivePluginsForTeam(teamId);
  const plugin = plugins.find((item) => item.pluginId === pluginId);

  if (!plugin) {
    return null;
  }

  const path = getPluginPath(pluginId, slug);
  const route = plugin.manifest.routes.find((item) => matchRoutePath(item.path, path));
  if (!route) {
    return null;
  }

  const renderer = resolvePluginPageRenderer(pluginId, slug);
  if (!renderer) {
    return null;
  }

  return { plugin, route, renderer };
}
