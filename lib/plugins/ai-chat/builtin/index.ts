import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiBuiltinTools } from '@/lib/db/schema';
import { getRegisteredPlugins } from '@/lib/plugins/core/registry';
import { resolveBotActivePluginIds } from './context';
import type { ToolDefinition } from '../types';
import type { BuiltinToolCatalogEntry, BuiltinToolDefinition } from './types';
import { calendarTools } from './calendar';
import { tasksTools } from './tasks';
import { customersTools } from './customers';
import { membershipsTools } from './memberships';
import { dealsTools } from './deals';
import { financeTools } from './finance';
import { knowledgeTools } from './knowledge';
import { scheduledMessagesTools } from './scheduled-messages';
import { salesTools } from './sales';
import { supportTools } from './support';
import { sitesTools } from './sites';
import { crmTools } from './crm';

/**
 * Catálogo completo de funciones integradas. El orden es el que ve el equipo
 * en Ajustes → IA → Function Calling.
 */
export const BUILTIN_TOOLS: BuiltinToolDefinition[] = [
  ...crmTools,
  ...knowledgeTools,
  ...calendarTools,
  ...customersTools,
  ...membershipsTools,
  ...salesTools,
  ...dealsTools,
  ...financeTools,
  ...tasksTools,
  ...scheduledMessagesTools,
  ...supportTools,
  ...sitesTools,
];

const byName = new Map(BUILTIN_TOOLS.map((tool) => [tool.name, tool]));

export function getBuiltinToolDefinition(name: string) {
  return byName.get(name) ?? null;
}

async function loadTeamState(teamId: number) {
  const [activePlugins, overrides] = await Promise.all([
    resolveBotActivePluginIds(teamId),
    db.select().from(aiBuiltinTools).where(eq(aiBuiltinTools.teamId, teamId)),
  ]);
  return {
    activePlugins,
    disabled: new Set(overrides.filter((row) => !row.enabled).map((row) => row.toolName)),
  };
}

/**
 * Funciones que el agente puede invocar en este equipo: el plugin que las
 * respalda está activo y nadie las apagó a mano.
 */
export async function getBuiltinToolsForTeam(teamId: number): Promise<ToolDefinition[]> {
  const { activePlugins, disabled } = await loadTeamState(teamId);
  return BUILTIN_TOOLS.filter((tool) => {
    if (disabled.has(tool.name)) return false;
    return tool.pluginId === null || activePlugins.has(tool.pluginId);
  }).map(({ name, description, parameters, execute }) => ({
    name,
    description,
    parameters,
    execute: (args, context) => execute(args, { chatId: context.chatId, teamId: context.teamId }),
  }));
}

/** Vista para la pantalla de ajustes: todas, con su estado real. */
export async function listBuiltinToolCatalog(teamId: number): Promise<BuiltinToolCatalogEntry[]> {
  const [{ activePlugins, disabled }, manifests] = await Promise.all([loadTeamState(teamId), getRegisteredPlugins()]);
  const names = new Map(manifests.map((m) => [m.id, m.displayName]));
  return BUILTIN_TOOLS.map((tool) => ({
    name: tool.name,
    pluginId: tool.pluginId,
    pluginName: tool.pluginId ? names.get(tool.pluginId) ?? tool.pluginId : 'WhatsPro',
    label: tool.label,
    summary: tool.summary,
    risk: tool.risk,
    pluginActive: tool.pluginId === null || activePlugins.has(tool.pluginId),
    enabled: !disabled.has(tool.name),
  }));
}

export async function setBuiltinToolEnabled(input: { teamId: number; toolName: string; enabled: boolean; userId?: number }) {
  if (!byName.has(input.toolName)) throw new Error(`Unknown builtin tool: ${input.toolName}`);
  await db
    .insert(aiBuiltinTools)
    .values({ teamId: input.teamId, toolName: input.toolName, enabled: input.enabled, updatedBy: input.userId ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [aiBuiltinTools.teamId, aiBuiltinTools.toolName],
      set: { enabled: input.enabled, updatedBy: input.userId ?? null, updatedAt: new Date() },
    });
}
