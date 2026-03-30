'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { listPluginsForTeam, saveTeamPluginState } from '@/lib/plugins/core/service';
import { getAllTeamsList } from '@/lib/db/admin-queries';

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
      error: null as string | null,
    };
  }

  try {
    const plugins = await listPluginsForTeam(teamId);

    return {
      selectedTeamId: teamId,
      teams,
      plugins,
      error: null as string | null,
    };
  } catch (error) {
    return {
      selectedTeamId: teamId,
      teams,
      plugins: [],
      error: error instanceof Error ? error.message : 'No se pudieron cargar los plugins.',
    };
  }
}

export async function saveTeamPluginAction(formData: FormData) {
  const user = await assertAdmin();

  const teamId = Number(formData.get('teamId'));
  const pluginId = String(formData.get('pluginId') ?? '');
  const enabled = formData.get('enabled') === 'on';
  const settingsRaw = String(formData.get('settings') ?? '{}');

  if (!teamId || Number.isNaN(teamId)) {
    throw new Error('Team inválido.');
  }

  let parsedSettings: Record<string, unknown> = {};
  try {
    parsedSettings = JSON.parse(settingsRaw);
  } catch {
    throw new Error('Settings debe ser JSON válido.');
  }

  await saveTeamPluginState({
    teamId,
    pluginId,
    enabled,
    settings: parsedSettings,
    actorUserId: user.id,
  });

  revalidatePath('/admin/plugins');
}
