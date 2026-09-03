import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiConfigs } from '@/lib/db/schema';

/**
 * Configuración del agente IA del equipo SIN la clave.
 *
 * La pantalla de Ajustes → IA hace un upsert completo (incluida `apiKey`) en
 * `settings/ai/actions.ts`; esto es la lectura pública y el parche parcial que
 * usan los conectores. La clave nunca sale de acá ni entra por acá: sólo se
 * informa si existe.
 */

export const AI_PROVIDERS = ['openai', 'gemini'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export type PublicAiConfig = {
  isActive: boolean;
  provider: string;
  model: string;
  systemPrompt: string | null;
  temperature: number;
  maxOutputTokens: number;
  attachments: { name: string; type: string; size: number }[];
  hasApiKey: boolean;
  updatedAt: string | null;
};

function toPublic(row: typeof aiConfigs.$inferSelect): PublicAiConfig {
  return {
    isActive: row.isActive,
    provider: row.provider,
    model: row.model,
    systemPrompt: row.systemPrompt ?? null,
    temperature: Number(row.temperature ?? 0.7),
    maxOutputTokens: row.maxOutputTokens ?? 1000,
    // Sin `url`: apunta a un archivo del servidor y no le sirve a un conector.
    attachments: (row.attachments ?? []).map((a) => ({ name: a.name, type: a.type, size: a.size })),
    hasApiKey: Boolean(row.apiKey),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

export async function getTeamAiConfigPublic(teamId: number): Promise<PublicAiConfig | null> {
  const row = await db.query.aiConfigs.findFirst({ where: eq(aiConfigs.teamId, teamId) });
  return row ? toPublic(row) : null;
}

export type AiConfigPatch = {
  isActive?: boolean;
  provider?: AiProvider;
  model?: string;
  systemPrompt?: string | null;
  temperature?: number;
  maxOutputTokens?: number;
};

/**
 * Parche parcial. Exige que la config ya exista: crearla requiere la clave, y
 * eso sólo se hace desde la pantalla.
 */
export async function patchTeamAiConfig(teamId: number, _userId: number, patch: AiConfigPatch): Promise<PublicAiConfig> {
  const existing = await db.query.aiConfigs.findFirst({ where: eq(aiConfigs.teamId, teamId), columns: { id: true } });
  if (!existing) {
    throw new Error('El equipo todavía no tiene configurado el agente IA: la clave del proveedor se carga desde Ajustes → IA.');
  }

  const set: Partial<typeof aiConfigs.$inferInsert> = { updatedAt: new Date() };
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.provider !== undefined) set.provider = patch.provider;
  if (patch.model !== undefined) set.model = patch.model.trim();
  if (patch.systemPrompt !== undefined) set.systemPrompt = patch.systemPrompt;
  if (patch.temperature !== undefined) set.temperature = patch.temperature.toFixed(1);
  if (patch.maxOutputTokens !== undefined) set.maxOutputTokens = patch.maxOutputTokens;

  const [row] = await db.update(aiConfigs).set(set).where(eq(aiConfigs.teamId, teamId)).returning();
  return toPublic(row);
}
