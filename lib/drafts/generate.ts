import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiConfigs } from '@/lib/db/schema';
import { getAIProviderForConfig } from '@/lib/plugins/ai-chat/service';
import type { AIMessage } from '@/lib/plugins/ai-chat/types';
import { DraftError } from './service';

export type DraftGenerateMode = 'create' | 'rewrite' | 'variables';

export type DraftGenerateInput = {
  prompt: string;
  mode?: DraftGenerateMode | null;
  baseContent?: string | null;
  draftType?: 'static' | 'dynamic' | null;
};

export function resolveDraftGenerateMode(value: unknown): DraftGenerateMode {
  return value === 'rewrite' || value === 'variables' ? value : 'create';
}

function buildPrompt(params: { prompt: string; mode: DraftGenerateMode; baseContent: string; draftType: 'static' | 'dynamic' }) {
  const modeInstruction =
    params.mode === 'rewrite'
      ? 'Reescribe el borrador de forma más clara y lista para enviar por WhatsApp.'
      : params.mode === 'variables'
        ? 'Genera o mejora un borrador dinámico usando placeholders con formato [[variable]].'
        : 'Genera un nuevo borrador listo para enviar por WhatsApp.';

  const dynamicInstruction =
    params.draftType === 'dynamic'
      ? 'Debe incluir placeholders útiles con formato [[variable]] cuando corresponda.'
      : 'No uses placeholders; devuelve texto final estático.';

  const sections = [
    modeInstruction,
    dynamicInstruction,
    params.baseContent ? `Borrador base (puedes mejorarlo):\n${params.baseContent}` : null,
    `Instrucciones del usuario:\n${params.prompt}`,
    'Devuelve solo el contenido final del borrador, sin markdown ni explicaciones.',
  ].filter(Boolean);

  return sections.join('\n\n');
}

/**
 * Genera el TEXTO de un borrador con el proveedor de IA del equipo. No guarda
 * nada y no envía nada: devuelve el contenido más la metadata que después se
 * persiste como `aiMetadata` del borrador. Consume cuota de IA.
 */
export async function generateDraft(teamId: number, _userId: number, input: DraftGenerateInput) {
  const prompt = String(input.prompt ?? '').trim();
  if (!prompt) throw new DraftError('prompt is required');

  const baseContent = String(input.baseContent ?? '').trim();
  const draftType = input.draftType === 'dynamic' ? 'dynamic' : 'static';
  const mode = resolveDraftGenerateMode(input.mode);

  const config = await db.query.aiConfigs.findFirst({ where: eq(aiConfigs.teamId, teamId) });
  if (!config) throw new DraftError('AI provider is not configured for this team.');

  const provider = await getAIProviderForConfig(config);
  const messages: AIMessage[] = [{ role: 'user', content: buildPrompt({ prompt, mode, baseContent, draftType }) }];

  const response = await provider.generateResponse(messages);
  const content = response.content?.trim() ?? '';
  if (!content) throw new DraftError('The AI provider returned an empty draft.', 502);

  return {
    content,
    draftType,
    metadata: { prompt, mode, generatedAt: new Date().toISOString() },
  };
}
