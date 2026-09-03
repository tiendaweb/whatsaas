import 'server-only';

import { listReadOnlyResource, readOnlyResourceMap } from '@/lib/readonly-api/catalog';
import { hasPermission, type MemberPermissions, type TeamRole } from '@/lib/permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import type { ApplicationDefinition, AppMakerRecord, ResolvedAppMakerView } from '../shared/contract';
import { APP_MAKER_ACTION_POLICY_MAP } from '../shared/connector-policies';
import { appMakerResourcePolicy } from './resource-permissions';
import {
  canUseAudience,
  findAppMakerEntity,
  listAppMakerEntityRecords,
} from './data-model';
import { filterAppMakerChatRows } from './chat-visibility';

export function canAccessApplication(
  definition: ApplicationDefinition,
  context: { userId: number; role: TeamRole | string },
) {
  const { roles, userIds } = definition.permissions;
  if (userIds?.length && !userIds.includes(context.userId)) return false;
  if (roles?.length && !roles.includes(context.role as TeamRole)) return false;
  return true;
}

function canAccessView(
  view: ApplicationDefinition['views'][number],
  context: { userId: number; role: TeamRole | string },
) {
  if (view.visibility?.userIds?.length && !view.visibility.userIds.includes(context.userId)) return false;
  if (view.visibility?.roles?.length && !view.visibility.roles.includes(context.role as TeamRole)) return false;
  return true;
}

function effectiveDefinition(record: AppMakerRecord, draft: boolean) {
  return draft ? record.definition : (record.publishedDefinition ?? record.definition);
}

export async function resolveAppMakerView(input: {
  teamId: number;
  userId: number;
  role: string;
  permissions?: MemberPermissions | null;
  record: AppMakerRecord;
  viewSlug?: string;
  draft?: boolean;
}): Promise<ResolvedAppMakerView> {
  const definition = effectiveDefinition(input.record, Boolean(input.draft));
  if (!canAccessApplication(definition, input)) throw new Error('forbidden');

  const visibleViews = definition.views.filter((view) => canAccessView(view, input));
  const activeView = visibleViews.find((view) => view.slug === input.viewSlug)
    ?? visibleViews.find((view) => view.slug === definition.navigation.defaultView)
    ?? visibleViews[0];
  if (!activeView) throw new Error('no_visible_views');

  const activePlugins = new Set(
    (await resolveActivePluginsForTeam(input.teamId, input.userId)).map((plugin) => plugin.pluginId),
  );
  const can = (permission: keyof Omit<MemberPermissions, 'chatVisibility'>) => hasPermission(
    input.role,
    input.permissions,
    permission,
  );

  const sourceKeys = new Set(
    activeView.sections.flatMap((section) => section.blocks.map((block) => block.dataSource).filter(Boolean)),
  );
  const selectedSources = definition.dataSources.filter((source) => sourceKeys.has(source.key));
  const entries = await Promise.all(selectedSources.map(async (source) => {
    if (source.resource.startsWith('app:')) {
      const entityKey = source.resource.slice(4);
      try {
        const result = await listAppMakerEntityRecords({
          app: input.record,
          definition,
          entityKey,
          source,
          context: {
            teamId: input.teamId,
            userId: input.userId,
            role: input.role,
            permissions: input.permissions,
          },
        });
        return [source.key, { rows: result.data, meta: result.meta as unknown as Record<string, unknown> }] as const;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo consultar la entidad.';
        return [source.key, { rows: [], error: message }] as const;
      }
    }
    const resource = readOnlyResourceMap.get(source.resource);
    if (!resource) return [source.key, { rows: [], error: `Recurso no disponible: ${source.resource}` }] as const;
    const policy = appMakerResourcePolicy(source.resource);
    if (!policy) return [source.key, { rows: [], error: `Recurso sin política de acceso: ${source.resource}` }] as const;
    if (!can(policy.permission)) return [source.key, { rows: [], error: `Permiso requerido: ${policy.permission}` }] as const;
    if (policy.pluginId && !activePlugins.has(policy.pluginId)) {
      return [source.key, { rows: [], error: `Plugin requerido no disponible: ${policy.pluginId}` }] as const;
    }
    const params = new URLSearchParams({ page: '1', per_page: String(source.pageSize) });
    if (source.search) params.set('q', source.search);
    for (const filter of source.filters ?? []) {
      if (resource.filters.includes(filter.field) && filter.value !== null) {
        params.set(filter.field, String(filter.value));
      }
    }
    try {
      const result = await listReadOnlyResource(resource, input.teamId, params);
      const visibleRows = await filterAppMakerChatRows(source.resource, result.data as Array<Record<string, unknown>>, {
        teamId: input.teamId,
        userId: input.userId,
        role: input.role,
        permissions: input.permissions,
      });
      const rows = visibleRows.map((row) => {
        if (!source.fields?.length) return row as Record<string, unknown>;
        return Object.fromEntries(source.fields.map((field) => [field, (row as Record<string, unknown>)[field]]));
      });
      return [source.key, { rows, meta: result.meta as unknown as Record<string, unknown> }] as const;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo consultar la fuente.';
      return [source.key, { rows: [], error: message }] as const;
    }
  }));

  const actions = definition.actions.filter((action) => {
    if (action.connector === 'app-maker') {
      if (!can('miniAppsWrite')) return false;
      const entityKey = String(action.inputDefaults?.entityKey ?? action.inputDefaults?.entity ?? '');
      const entity = findAppMakerEntity(definition, entityKey);
      if (!entity) return true;
      const operation = action.operation === 'appmaker_create_record' ? 'create'
        : action.operation === 'appmaker_delete_record' ? 'delete'
          : 'update';
      return canUseAudience(entity.permissions[operation], input);
    }
    const policy = APP_MAKER_ACTION_POLICY_MAP.get(action.operation);
    if (!policy || action.connector !== 'whatspro') return false;
    if (policy.pluginId && !activePlugins.has(policy.pluginId)) return false;
    return policy.destructive
      ? policy.permissions.some((permission) => can(permission as keyof Omit<MemberPermissions, 'chatVisibility'>))
      : policy.permissions.every((permission) => can(permission as keyof Omit<MemberPermissions, 'chatVisibility'>));
  });

  return {
    app: {
      slug: input.record.slug,
      name: input.record.name,
      status: input.record.status,
      version: input.record.version,
      publishedVersion: input.record.publishedVersion,
      description: definition.description,
      icon: definition.icon,
      category: definition.category,
      theme: definition.theme,
      design: definition.design,
    },
    definition: {
      navigation: definition.navigation,
      views: visibleViews,
    },
    activeView,
    data: Object.fromEntries(entries),
    actions,
  };
}
