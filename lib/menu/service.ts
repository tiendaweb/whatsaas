import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMenuItems, teamMembers } from '@/lib/db/schema';
import { checkFeature, type FeatureFlag } from '@/lib/limits';
import type { MemberPermissions } from '@/lib/permissions';
import { resolveDashboardNavForTeam } from '@/lib/plugins/core/registry';
import { estaAgrupada } from './agrupadas';
import {
  APPS_LAUNCHER_PREFIXES,
  compareMainNavigation,
  CORE_NAV_ITEMS,
  isAppsOnlyItem,
  isMainNavOnlyItem,
  type MenuOverride,
} from './core-nav-items';

export async function getTeamMenuOverrides(teamId: number): Promise<MenuOverride[]> {
  const rows = await db
    .select({ itemKey: teamMenuItems.itemKey, pinned: teamMenuItems.pinned, order: teamMenuItems.order })
    .from(teamMenuItems)
    .where(eq(teamMenuItems.teamId, teamId));
  return rows;
}

export type ResolvedMenuItem = {
  key: string;
  href: string;
  label: string;
  icon: string;
  description: string;
  source: 'core' | 'plugin';
  pinned: boolean;
  order: number;
};

async function getMemberContext(teamId: number, userId?: number) {
  if (!userId) return { role: null as string | null, permissions: null as MemberPermissions | null };
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
    columns: { role: true, permissions: true },
  });
  return {
    role: member?.role ?? null,
    permissions: (member?.permissions as MemberPermissions | null) ?? null,
  };
}

export async function resolveMenuForTeam(teamId: number, userId?: number): Promise<{ mainNav: ResolvedMenuItem[]; apps: ResolvedMenuItem[] }> {
  const [overrides, pluginNavItems, { role, permissions }] = await Promise.all([
    getTeamMenuOverrides(teamId),
    resolveDashboardNavForTeam(teamId, userId),
    getMemberContext(teamId, userId),
  ]);

  const overrideMap = new Map(overrides.map((o) => [o.itemKey, o]));

  const featureFlags = Array.from(new Set(CORE_NAV_ITEMS.map((item) => item.feature).filter((f): f is FeatureFlag => Boolean(f))));
  const featureResults = await Promise.all(featureFlags.map((flag) => checkFeature(teamId, flag)));
  const featureMap = new Map(featureFlags.map((flag, idx) => [flag, featureResults[idx]]));

  const coreCandidates: ResolvedMenuItem[] = CORE_NAV_ITEMS
    // Lo agrupado no se repite suelto, sea del núcleo o de un plugin.
    .filter((item) => !estaAgrupada(item.href))
    .filter((item) => {
      if (item.feature && featureMap.get(item.feature as FeatureFlag) !== true) return false;
      if (item.permissionKey && permissions) {
        if (role === 'owner' || role === 'admin') return true;
        return permissions[item.permissionKey as keyof MemberPermissions] === true;
      }
      return true;
    })
    .map((item) => {
      const override = overrideMap.get(item.key);
      return {
        key: item.key,
        href: item.href,
        label: item.label,
        icon: item.icon,
        description: item.description,
        source: 'core' as const,
        pinned: isAppsOnlyItem(item.href) ? false : override?.pinned ?? true,
        order: override?.order ?? item.order,
      };
    });

  const pluginCandidates: ResolvedMenuItem[] = pluginNavItems
    .filter((item) => !item.href.startsWith('/plugins/marketplace'))
    // Lo agrupado adentro de Empresa o Marketing no se repite suelto. Va acá
    // además de en el cliente porque el editor de menú y el móvil leen esto.
    .filter((item) => !estaAgrupada(item.href))
    .map((item, idx) => {
      const override = overrideMap.get(item.href);
      const defaultPinned = !APPS_LAUNCHER_PREFIXES.some((prefix) => item.href.startsWith(prefix));
      return {
        key: item.href,
        href: item.href,
        label: item.label,
        icon: item.icon ?? 'Plug',
        description: 'Aplicación disponible para tu equipo.',
        source: 'plugin' as const,
        pinned: isMainNavOnlyItem(item.href)
          ? true
          : isAppsOnlyItem(item.href)
            ? false
            : override?.pinned ?? defaultPinned,
        order: override?.order ?? (100 + idx),
      };
    });

  const all = [...coreCandidates, ...pluginCandidates];
  const mainNav = all.filter((item) => item.pinned).sort(compareMainNavigation);
  const apps = all.filter((item) => !item.pinned).sort((a, b) => a.order - b.order);

  return { mainNav, apps };
}

export async function setMainNavOrder(teamId: number, orderedKeys: string[], actorUserId: number): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [order, itemKey] of orderedKeys.entries()) {
      await tx
        .insert(teamMenuItems)
        .values({ teamId, itemKey, pinned: true, order, updatedBy: actorUserId })
        .onConflictDoUpdate({
          target: [teamMenuItems.teamId, teamMenuItems.itemKey],
          set: { pinned: true, order, updatedBy: actorUserId, updatedAt: new Date() },
        });
    }
  });
}

export async function setItemPinned(
  teamId: number,
  itemKey: string,
  pinned: boolean,
  actorUserId: number,
): Promise<void> {
  // Estas ubicaciones forman parte de la navegación base del producto. Ignorar
  // overrides incompatibles evita que una preferencia antigua revierta el menú.
  if ((isAppsOnlyItem(itemKey) && pinned) || (isMainNavOnlyItem(itemKey) && !pinned)) return;

  let order = 0;
  if (pinned) {
    const current = await getTeamMenuOverrides(teamId);
    const maxPinnedOrder = current
      .filter((item) => item.pinned)
      .reduce((max, item) => Math.max(max, item.order), -1);
    order = maxPinnedOrder + 1;
  }

  await db
    .insert(teamMenuItems)
    .values({ teamId, itemKey, pinned, order, updatedBy: actorUserId })
    .onConflictDoUpdate({
      target: [teamMenuItems.teamId, teamMenuItems.itemKey],
      set: { pinned, ...(pinned ? { order } : {}), updatedBy: actorUserId, updatedAt: new Date() },
    });
}
