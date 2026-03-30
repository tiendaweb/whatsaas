'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import {
  listPluginsForTeam,
  listTeamMembersForPluginAccess,
  saveSystemPluginState,
  saveTeamMemberPluginState,
  saveTeamPluginState,
} from '@/lib/plugins/core/service';
import { getAllTeamsList } from '@/lib/db/admin-queries';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';

async function assertAdmin() {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  return user;
}

export async function getPluginsAdminData(selectedTeamId?: number) {
  await assertAdmin();

  const teams = await getAllTeamsList();
  const teamId = selectedTeamId ?? teams[0]?.id ?? null;

  if (!teamId) {
    return {
      selectedTeamId: null,
      teams,
      plugins: [],
      members: [],
      memberOverrides: [],
      error: null as string | null,
    };
  }

  try {
    const [plugins, memberAccess, memberProfiles] = await Promise.all([
      listPluginsForTeam(teamId),
      listTeamMembersForPluginAccess(teamId),
      db.select({ id: users.id, name: users.name, email: users.email }).from(users),
    ]);

    const memberProfileMap = new Map(memberProfiles.map((item) => [item.id, item]));

    return {
      selectedTeamId: teamId,
      teams,
      plugins,
      members: memberAccess.members.map((member) => ({
        userId: member.userId,
        role: member.role,
        profile: memberProfileMap.get(member.userId) ?? null,
      })),
      memberOverrides: memberAccess.overrides,
      error: null as string | null,
    };
  } catch (error) {
    return {
      selectedTeamId: teamId,
      teams,
      plugins: [],
      members: [],
      memberOverrides: [],
      error: error instanceof Error ? error.message : 'No se pudieron cargar los plugins.',
    };
  }
}

export async function saveSystemPluginAction(formData: FormData) {
  const user = await assertAdmin();

  const pluginId = String(formData.get('pluginId') ?? '');
  const enabledByDefault = formData.get('enabledByDefault') === 'on';

  await saveSystemPluginState({
    pluginId,
    enabledByDefault,
    actorUserId: user.id,
  });

  revalidatePath('/admin/plugins');
}

function parseSettingField(value: FormDataEntryValue | null, type: string): unknown {
  const raw = String(value ?? '');

  if (type === 'boolean') {
    return raw === 'on';
  }

  if (type === 'number') {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error('Valor numérico inválido en settings.');
    }
    return parsed;
  }

  if (type === 'json') {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      throw new Error('Campo JSON inválido en settings.');
    }
  }

  return raw;
}

export async function saveTeamPluginAction(formData: FormData) {
  const user = await assertAdmin();

  const teamId = Number(formData.get('teamId'));
  const pluginId = String(formData.get('pluginId') ?? '');
  const enabled = formData.get('enabled') === 'on';

  if (!teamId || Number.isNaN(teamId)) {
    throw new Error('Team inválido.');
  }

  const settings: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('settings.')) continue;
    const [, settingKey, settingType = 'string'] = key.split('.');
    settings[settingKey] = parseSettingField(value, settingType);
  }

  await saveTeamPluginState({
    teamId,
    pluginId,
    enabled,
    settings,
    actorUserId: user.id,
  });

  revalidatePath('/admin/plugins');
}

export async function saveTeamMemberPluginAction(formData: FormData) {
  const user = await assertAdmin();

  const teamId = Number(formData.get('teamId'));
  const pluginId = String(formData.get('pluginId') ?? '');
  const memberUserId = Number(formData.get('memberUserId'));
  const enabled = formData.get('enabled') === 'on';

  if (!teamId || Number.isNaN(teamId)) {
    throw new Error('Team inválido.');
  }

  if (!memberUserId || Number.isNaN(memberUserId)) {
    throw new Error('Usuario inválido.');
  }

  await saveTeamMemberPluginState({
    teamId,
    userId: memberUserId,
    pluginId,
    enabled,
    actorUserId: user.id,
  });

  revalidatePath('/admin/plugins');
}
