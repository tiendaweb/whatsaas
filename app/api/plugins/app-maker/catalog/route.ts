import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { hasPermission } from '@/lib/permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { readOnlyResourceMetadata, readOnlyResources } from '@/lib/readonly-api/catalog';
import { appMakerActionCatalog, appMakerConnectorCatalog } from '@/lib/plugins/app-maker/server/connectors';
import { appMakerResourcePolicy } from '@/lib/plugins/app-maker/server/resource-permissions';
import {
  APP_MAKER_BLOCK_REGISTRY,
  APP_MAKER_CHART_TYPE_REGISTRY,
  APP_MAKER_DESIGN_TEMPLATE_REGISTRY,
  APP_MAKER_FIELD_TYPE_REGISTRY,
  APP_MAKER_FORM_FIELD_TYPE_REGISTRY,
  APP_MAKER_FORM_PRESENTATION_REGISTRY,
  APP_MAKER_NAVIGATION_REGISTRY,
  APP_MAKER_RELATION_TYPE_REGISTRY,
  APP_MAKER_TEMPLATE_REGISTRY,
  APP_MAKER_VIEW_REGISTRY,
} from '@/lib/plugins/app-maker/shared/registries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getPluginRequestContext('miniAppsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const activePlugins = new Set(
    (await resolveActivePluginsForTeam(ctx.team.id, ctx.user.id)).map((plugin) => plugin.pluginId),
  );
  const can = (permission: Parameters<typeof hasPermission>[2]) => hasPermission(
    ctx.membership.role,
    ctx.membership.permissions,
    permission,
  );
  const resources = readOnlyResources.map((resource) => {
    const policy = appMakerResourcePolicy(resource.key);
    const missingPermissions = !policy || !can(policy.permission) ? [policy?.permission ?? 'unmapped'] : [];
    const missingPlugins = policy?.pluginId && !activePlugins.has(policy.pluginId) ? [policy.pluginId] : [];
    return {
      ...readOnlyResourceMetadata(resource),
      requiredPermission: policy?.permission ?? null,
      requiredPlugin: policy?.pluginId ?? null,
      available: missingPermissions.length === 0 && missingPlugins.length === 0,
      missingPermissions,
      missingPlugins,
    };
  });
  const actions = appMakerActionCatalog().map((action) => {
    const granted = action.destructive
      ? action.permissions.some((permission) => can(permission as Parameters<typeof hasPermission>[2]))
      : action.permissions.every((permission) => can(permission as Parameters<typeof hasPermission>[2]));
    const missingPermissions = granted ? [] : action.permissions;
    const missingPlugins = action.requiredPlugin && !activePlugins.has(action.requiredPlugin) ? [action.requiredPlugin] : [];
    return { ...action, available: granted && missingPlugins.length === 0, missingPermissions, missingPlugins };
  });
  const connectors = appMakerConnectorCatalog().map((connector) => ({
    ...connector,
    actions: actions.filter((action) => action.connector === connector.key),
  }));
  return NextResponse.json({
    blocks: APP_MAKER_BLOCK_REGISTRY,
    charts: APP_MAKER_CHART_TYPE_REGISTRY,
    formFields: APP_MAKER_FORM_FIELD_TYPE_REGISTRY,
    formPresentations: APP_MAKER_FORM_PRESENTATION_REGISTRY,
    designTemplates: APP_MAKER_DESIGN_TEMPLATE_REGISTRY.map(({ runtime: _runtime, ...template }) => template),
    views: APP_MAKER_VIEW_REGISTRY,
    navigation: APP_MAKER_NAVIGATION_REGISTRY,
    fieldTypes: APP_MAKER_FIELD_TYPE_REGISTRY,
    relationTypes: APP_MAKER_RELATION_TYPE_REGISTRY,
    resources,
    actions,
    connectors,
    templates: APP_MAKER_TEMPLATE_REGISTRY.map(({ key, name, description, definition }) => ({
      key,
      name,
      description,
      preview: { icon: definition.icon, accent: definition.theme.accent, designTemplate: definition.design.template, views: definition.views.map((view) => view.name) },
    })),
  });
}
