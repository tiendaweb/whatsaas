import { and, eq, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { pluginSystemStates, teamMemberPlugins, teamMembers, teamPlugins, users } from '@/lib/db/schema';
import { getRegisteredPluginById, getRegisteredPlugins } from './registry';

const FORM_BUILDER_PLUGIN_ID = 'form-builder';
const DEFAULT_FORM_BUILDER_EMAILS = ['noelia@whatspro.uno'];

function getDefaultFormBuilderEmails() {
  return DEFAULT_FORM_BUILDER_EMAILS
    .concat((process.env.FORM_BUILDER_DEFAULT_EMAILS ?? '').split(','))
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function ensureDefaultFormBuilderForTeam(teamId: number, actorUserId?: number | null) {
  const emails = getDefaultFormBuilderEmails();
  if (emails.length === 0) return;

  const existing = await db.query.teamPlugins.findFirst({
    where: and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, FORM_BUILDER_PLUGIN_ID)),
    columns: { id: true },
  });
  if (existing) return;

  const matchingMember = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, teamId), inArray(sql<string>`lower(${users.email})`, emails)))
    .limit(1);

  if (matchingMember.length === 0) return;

  await db.insert(teamPlugins).values({
    teamId,
    pluginId: FORM_BUILDER_PLUGIN_ID,
    installed: true,
    enabled: true,
    settings: {},
    installedBy: actorUserId ?? null,
    installedAt: new Date(),
    updatedAt: new Date(),
  });
}

async function ensurePluginTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS team_plugins (
      id serial PRIMARY KEY,
      team_id integer NOT NULL,
      plugin_id varchar(80) NOT NULL,
      installed boolean NOT NULL DEFAULT false,
      enabled boolean NOT NULL DEFAULT false,
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      installed_by integer,
      installed_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT team_plugins_team_id_plugin_id_idx UNIQUE(team_id, plugin_id)
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS team_plugins_team_enabled_idx
    ON team_plugins(team_id, enabled);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS plugin_system_states (
      id serial PRIMARY KEY,
      plugin_id varchar(80) NOT NULL UNIQUE,
      enabled_by_default boolean NOT NULL DEFAULT false,
      updated_by integer,
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS team_member_plugins (
      id serial PRIMARY KEY,
      team_id integer NOT NULL,
      user_id integer NOT NULL,
      plugin_id varchar(80) NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      updated_by integer,
      updated_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT team_member_plugins_team_user_plugin_idx UNIQUE(team_id, user_id, plugin_id)
    );
  `);
}

export async function ensureSystemPluginStateForTeam(teamId: number, actorUserId?: number) {
  await ensurePluginTables();
  const plugins = await getRegisteredPlugins();
  const systemPlugins = plugins.filter((plugin) => plugin.activationMode === 'system');

  // Ensure core global plugins like tasks are enabled by default for all teams
  const alwaysOnGlobalPluginIds = ['tasks'];

  await Promise.all(
    systemPlugins.map(async (plugin) => {
      await db
        .insert(teamPlugins)
        .values({
          teamId,
          pluginId: plugin.id,
          installed: true,
          enabled: true,
          settings: {},
          installedBy: actorUserId ?? null,
          installedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [teamPlugins.teamId, teamPlugins.pluginId],
          set: {
            installed: true,
            enabled: true,
            updatedAt: new Date(),
          },
        });

      await db
        .insert(pluginSystemStates)
        .values({
          pluginId: plugin.id,
          enabledByDefault: true,
          updatedBy: actorUserId ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: pluginSystemStates.pluginId,
          set: {
            enabledByDefault: true,
            updatedBy: actorUserId ?? null,
            updatedAt: new Date(),
          },
      });
    }),
  );

  // Ensure always-on global plugins (e.g. Tasks OS) have enabledByDefault
  await Promise.all(
    alwaysOnGlobalPluginIds.map(async (pid) => {
      await db
        .insert(pluginSystemStates)
        .values({
          pluginId: pid,
          enabledByDefault: true,
          updatedBy: actorUserId ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: pluginSystemStates.pluginId,
          set: {
            enabledByDefault: true,
            updatedBy: actorUserId ?? null,
            updatedAt: new Date(),
          },
        });

      // Also ensure team has it enabled
      await db
        .insert(teamPlugins)
        .values({
          teamId,
          pluginId: pid,
          installed: true,
          enabled: true,
          settings: {},
          installedBy: actorUserId ?? null,
          installedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [teamPlugins.teamId, teamPlugins.pluginId],
          set: {
            installed: true,
            enabled: true,
            updatedAt: new Date(),
          },
        });
    }),
  );

  if (plugins.some((plugin) => plugin.id === FORM_BUILDER_PLUGIN_ID)) {
    await ensureDefaultFormBuilderForTeam(teamId, actorUserId);
  }
}

export async function listPluginsForTeam(teamId: number) {
  const availablePlugins = await getRegisteredPlugins();
  let installedPlugins: Array<typeof teamPlugins.$inferSelect> = [];
  let systemDefaults: Array<typeof pluginSystemStates.$inferSelect> = [];

  try {
    await ensureSystemPluginStateForTeam(teamId);
    installedPlugins = await db.select().from(teamPlugins).where(eq(teamPlugins.teamId, teamId));
    systemDefaults = await db.select().from(pluginSystemStates);
  } catch (error) {
    throw new Error(
      `No se pudo leer la configuración de plugins para el equipo ${teamId}. Verifica migraciones de base de datos (team_plugins/team_member_plugins/plugin_system_states).`,
      { cause: error },
    );
  }

  const installedMap = new Map(installedPlugins.map((plugin) => [plugin.pluginId, plugin]));
  const defaultsMap = new Map(systemDefaults.map((item) => [item.pluginId, item]));

  return availablePlugins.map((manifest) => {
    const installed = installedMap.get(manifest.id);
    const systemDefault = defaultsMap.get(manifest.id);

    return {
      manifest,
      state: {
        installed: installed?.installed ?? false,
        enabled: installed?.enabled ?? false,
        settings: (installed?.settings as Record<string, unknown>) ?? {},
        systemEnabledByDefault: systemDefault?.enabledByDefault ?? (manifest.activationMode === 'system'),
      },
    };
  });
}

export async function saveSystemPluginState(input: { pluginId: string; enabledByDefault: boolean; actorUserId?: number }) {
  await ensurePluginTables();

  const manifest = await getRegisteredPluginById(input.pluginId);
  if (!manifest) {
    throw new Error('Plugin no encontrado en el registry.');
  }

  if (manifest.activationMode === 'system' && !input.enabledByDefault) {
    throw new Error('Los plugins de sistema no se pueden desactivar.');
  }

  await db
    .insert(pluginSystemStates)
    .values({
      pluginId: input.pluginId,
      enabledByDefault: input.enabledByDefault,
      updatedBy: input.actorUserId ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pluginSystemStates.pluginId,
      set: {
        enabledByDefault: input.enabledByDefault,
        updatedBy: input.actorUserId ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function saveTeamPluginState(input: {
  teamId: number;
  pluginId: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  actorUserId?: number;
}) {
  await ensurePluginTables();

  const manifest = await getRegisteredPluginById(input.pluginId);
  if (!manifest) {
    throw new Error('Plugin no encontrado en el registry.');
  }

  if (manifest.activationMode === 'system' && !input.enabled) {
    throw new Error('Los plugins de sistema no se pueden desactivar.');
  }

  const parsedSettings = manifest.settingsSchema.safeParse(input.settings ?? {});
  if (!parsedSettings.success) {
    throw new Error(`Configuración inválida: ${parsedSettings.error.issues.map((i) => i.message).join(', ')}`);
  }

  const existing = await db.query.teamPlugins.findFirst({
    where: and(eq(teamPlugins.teamId, input.teamId), eq(teamPlugins.pluginId, input.pluginId)),
  });

  const nextSettings = parsedSettings.data as Record<string, unknown>;

  if (!existing) {
    if (input.enabled && manifest.install) {
      await manifest.install({
        teamId: input.teamId,
        actorUserId: input.actorUserId,
        settings: nextSettings,
      });
    }

    await db.insert(teamPlugins).values({
      teamId: input.teamId,
      pluginId: input.pluginId,
      installed: input.enabled,
      enabled: input.enabled,
      settings: nextSettings,
      installedBy: input.actorUserId ?? null,
      installedAt: new Date(),
      updatedAt: new Date(),
    });

    return;
  }

  if (input.enabled && !existing.enabled && manifest.install) {
    await manifest.install({
      teamId: input.teamId,
      actorUserId: input.actorUserId,
      settings: nextSettings,
    });
  }

  if (!input.enabled && existing.enabled && manifest.uninstall) {
    await manifest.uninstall({
      teamId: input.teamId,
      actorUserId: input.actorUserId,
      settings: nextSettings,
    });
  }

  await db
    .update(teamPlugins)
    .set({
      enabled: input.enabled,
      installed: input.enabled ? true : existing.installed,
      settings: nextSettings,
      updatedAt: new Date(),
    })
    .where(and(eq(teamPlugins.teamId, input.teamId), eq(teamPlugins.pluginId, input.pluginId)));
}

export async function listTeamMembersForPluginAccess(teamId: number) {
  await ensurePluginTables();

  const members = await db
    .select({
      userId: teamMembers.userId,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));

  const overrides = await db.select().from(teamMemberPlugins).where(eq(teamMemberPlugins.teamId, teamId));

  return {
    members,
    overrides,
  };
}

export async function saveTeamMemberPluginState(input: {
  teamId: number;
  userId: number;
  pluginId: string;
  enabled: boolean;
  actorUserId?: number;
}) {
  await ensurePluginTables();

  const manifest = await getRegisteredPluginById(input.pluginId);
  if (!manifest) {
    throw new Error('Plugin no encontrado en el registry.');
  }

  await db
    .insert(teamMemberPlugins)
    .values({
      teamId: input.teamId,
      userId: input.userId,
      pluginId: input.pluginId,
      enabled: input.enabled,
      updatedBy: input.actorUserId ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [teamMemberPlugins.teamId, teamMemberPlugins.userId, teamMemberPlugins.pluginId],
      set: {
        enabled: input.enabled,
        updatedBy: input.actorUserId ?? null,
        updatedAt: new Date(),
      },
    });
}

/**
 * Apps que nunca se apagan aunque su manifest no diga `system`. La pantalla de
 * Apps y el conector MCP consultan la misma lista: si viviera en la route, el
 * conector podría apagar lo que la pantalla muestra como fijo.
 */
export const ALWAYS_ON_PLUGIN_IDS: ReadonlySet<string> = new Set(['tasks']);

export class PluginToggleError extends Error {
  constructor(
    public readonly code: 'not_found' | 'always_on' | 'team_admin_required' | 'scope_not_allowed',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Prende o apaga una app tal como lo hace la pantalla de Apps.
 *
 * La regla es la del manifest: `global` se decide por equipo y sólo owner/admin
 * pueden tocarla; `user` y `hybrid` se deciden por persona (`targetUserId`,
 * que por defecto es quien llama; apuntar a otra persona también exige
 * owner/admin). `system` y ALWAYS_ON no se tocan. Devuelve en qué ámbito quedó
 * guardado el cambio.
 */
export async function setPluginEnabledByMember(input: {
  teamId: number;
  actorUserId: number;
  actorRole: string;
  pluginId: string;
  enabled: boolean;
  targetUserId?: number;
}): Promise<{ pluginId: string; enabled: boolean; scope: 'team' | 'member'; userId: number | null }> {
  const manifest = await getRegisteredPluginById(input.pluginId);
  if (!manifest || manifest.id === 'marketplace') {
    throw new PluginToggleError('not_found', 'Plugin not found.');
  }
  if (manifest.activationMode === 'system' || ALWAYS_ON_PLUGIN_IDS.has(manifest.id)) {
    throw new PluginToggleError('always_on', 'System plugins cannot be disabled.');
  }

  const canManageTeam = input.actorRole === 'owner' || input.actorRole === 'admin';
  const targetUserId = input.targetUserId ?? input.actorUserId;
  if (targetUserId !== input.actorUserId && !canManageTeam) {
    throw new PluginToggleError('team_admin_required', 'Only a team owner or administrator can change apps for other members.');
  }

  if (manifest.activationMode === 'global') {
    if (!canManageTeam) {
      throw new PluginToggleError('team_admin_required', 'Only a team owner or administrator can change this app.');
    }
    if (input.targetUserId !== undefined && input.targetUserId !== input.actorUserId) {
      throw new PluginToggleError('scope_not_allowed', 'This app is enabled for the whole team, not per member.');
    }
    const current = await db.query.teamPlugins.findFirst({
      where: and(eq(teamPlugins.teamId, input.teamId), eq(teamPlugins.pluginId, manifest.id)),
      columns: { settings: true },
    });
    await saveTeamPluginState({
      teamId: input.teamId,
      pluginId: manifest.id,
      enabled: input.enabled,
      settings: (current?.settings as Record<string, unknown> | null) ?? {},
      actorUserId: input.actorUserId,
    });
    return { pluginId: manifest.id, enabled: input.enabled, scope: 'team', userId: null };
  }

  if (targetUserId !== input.actorUserId) {
    const member = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, targetUserId)),
      columns: { userId: true },
    });
    if (!member) throw new PluginToggleError('not_found', 'Member not found in this team.');
  }

  await saveTeamMemberPluginState({
    teamId: input.teamId,
    userId: targetUserId,
    pluginId: manifest.id,
    enabled: input.enabled,
    actorUserId: input.actorUserId,
  });
  return { pluginId: manifest.id, enabled: input.enabled, scope: 'member', userId: targetUserId };
}
