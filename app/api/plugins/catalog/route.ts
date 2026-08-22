import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedTeam } from '@/lib/auth/api';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  pluginSystemStates,
  teamMemberPlugins,
  teamMembers,
  teamPlugins,
} from '@/lib/db/schema';
import {
  getRegisteredPluginById,
  getRegisteredPlugins,
} from '@/lib/plugins/core/registry';
import {
  ensureSystemPluginStateForTeam,
  saveTeamMemberPluginState,
  saveTeamPluginState,
} from '@/lib/plugins/core/service';

const updatePluginSchema = z.object({
  pluginId: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
}).strict();

type PluginCategory =
  | 'ai'
  | 'business'
  | 'connectors'
  | 'content'
  | 'marketing'
  | 'productivity'
  | 'tools'
  | 'web';

const PLUGIN_CATEGORIES: Partial<Record<string, PluginCategory>> = {
  'ai-chat': 'ai',
  'grok-connector': 'connectors',
  'claude-code-connector': 'connectors',
  'chatgpt-connector': 'connectors',
  radar: 'ai',
  sales: 'business',
  customers: 'business',
  memberships: 'business',
  finance: 'business',
  'aapp-space': 'business',
  notes: 'content',
  articles: 'content',
  documents: 'content',
  files: 'content',
  'form-builder': 'content',
  'scheduled-messages': 'marketing',
  'social-publisher': 'marketing',
  'meta-ads': 'marketing',
  calendar: 'productivity',
  tasks: 'productivity',
  'mini-apps': 'tools',
  domains: 'web',
  sites: 'web',
  hostinger: 'web',
};

const ALWAYS_ON_PLUGIN_IDS = new Set(['tasks']);

async function authenticatedContext(request: NextRequest) {
  const [team, user] = await Promise.all([getAuthenticatedTeam(request), getUser()]);
  if (!team || !user) return null;

  const membership = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, user.id)),
    columns: { role: true },
  });
  if (!membership) return null;
  return { team, user, membership };
}

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatedContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureSystemPluginStateForTeam(context.team.id, context.user.id);
    const [manifests, teamStates, systemStates, memberStates] = await Promise.all([
      getRegisteredPlugins(),
      db.select().from(teamPlugins).where(eq(teamPlugins.teamId, context.team.id)),
      db.select().from(pluginSystemStates),
      db.select().from(teamMemberPlugins).where(and(
        eq(teamMemberPlugins.teamId, context.team.id),
        eq(teamMemberPlugins.userId, context.user.id),
      )),
    ]);

    const teamStateByPlugin = new Map(teamStates.map((state) => [state.pluginId, state]));
    const systemStateByPlugin = new Map(systemStates.map((state) => [state.pluginId, state]));
    const memberStateByPlugin = new Map(memberStates.map((state) => [state.pluginId, state]));
    const canManageTeam = context.membership.role === 'owner' || context.membership.role === 'admin';

    const data = manifests
      .filter((manifest) => manifest.id !== 'marketplace')
      .map((manifest) => {
        const isAlwaysOn = manifest.activationMode === 'system' || ALWAYS_ON_PLUGIN_IDS.has(manifest.id);
        const teamState = teamStateByPlugin.get(manifest.id);
        const systemState = systemStateByPlugin.get(manifest.id);
        const memberState = memberStateByPlugin.get(manifest.id);
        const teamEnabled = teamState
          ? teamState.enabled
          : (systemState?.enabledByDefault ?? manifest.activationMode === 'system');
        const effectiveEnabled = isAlwaysOn
          ? true
          : manifest.activationMode === 'user'
            ? memberState?.enabled === true
            : manifest.activationMode === 'hybrid'
              ? (memberState?.enabled ?? teamEnabled)
              : teamEnabled;
        const canToggle = !isAlwaysOn && (manifest.activationMode === 'user'
          || manifest.activationMode === 'hybrid'
          || (manifest.activationMode === 'global' && canManageTeam));

        return {
          id: manifest.id,
          displayName: manifest.displayName,
          activationMode: manifest.activationMode,
          category: PLUGIN_CATEGORIES[manifest.id] ?? 'tools',
          free: true,
          routes: manifest.routes.map((route) => ({ path: route.path, title: route.title })),
          navItems: manifest.navItems.map((item) => ({
            href: item.href,
            label: item.label,
            icon: item.icon,
            order: item.order,
          })),
          featureFlags: manifest.featureFlags,
          state: {
            installed: teamState?.installed ?? memberState?.enabled === true,
            enabled: effectiveEnabled,
            teamEnabled,
            memberOverride: memberState?.enabled ?? null,
            canToggle,
            lockedReason: isAlwaysOn
              ? 'system'
              : manifest.activationMode === 'global' && !canManageTeam
                ? 'team_admin'
                : null,
          },
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[plugins/catalog GET]', error);
    return NextResponse.json({ error: 'Could not load the plugin catalog.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await authenticatedContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parsed = updatePluginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const manifest = await getRegisteredPluginById(parsed.data.pluginId);
    if (!manifest || manifest.id === 'marketplace') {
      return NextResponse.json({ error: 'Plugin not found.' }, { status: 404 });
    }
    if (manifest.activationMode === 'system' || ALWAYS_ON_PLUGIN_IDS.has(manifest.id)) {
      return NextResponse.json({ error: 'System plugins cannot be disabled.' }, { status: 409 });
    }

    if (manifest.activationMode === 'global') {
      const canManageTeam = context.membership.role === 'owner' || context.membership.role === 'admin';
      if (!canManageTeam) {
        return NextResponse.json({ error: 'Only a team owner or administrator can change this app.' }, { status: 403 });
      }
      const current = await db.query.teamPlugins.findFirst({
        where: and(eq(teamPlugins.teamId, context.team.id), eq(teamPlugins.pluginId, manifest.id)),
        columns: { settings: true },
      });
      await saveTeamPluginState({
        teamId: context.team.id,
        pluginId: manifest.id,
        enabled: parsed.data.enabled,
        settings: current?.settings ?? {},
        actorUserId: context.user.id,
      });
    } else {
      await saveTeamMemberPluginState({
        teamId: context.team.id,
        userId: context.user.id,
        pluginId: manifest.id,
        enabled: parsed.data.enabled,
        actorUserId: context.user.id,
      });
    }

    await db.insert(activityLogs).values({
      teamId: context.team.id,
      userId: context.user.id,
      action: parsed.data.enabled ? 'app.plugin.enabled' : 'app.plugin.disabled',
      ipAddress: manifest.id.slice(0, 45),
    });

    return NextResponse.json({ success: true, pluginId: manifest.id, enabled: parsed.data.enabled });
  } catch (error) {
    console.error('[plugins/catalog PATCH]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Could not update the plugin.',
    }, { status: 500 });
  }
}
