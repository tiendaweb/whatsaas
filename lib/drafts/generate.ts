import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiConfigs } from '@/lib/db/schema';
import { analizarTextoConBanco, esErrorDeCuota } from '@/lib/gemini/key-bank';
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

  const texto = buildPrompt({ prompt, mode, baseContent, draftType });
  const config = await db.query.aiConfigs.findFirst({ where: eq(aiConfigs.teamId, teamId) });

  let content = '';
  let via: 'proveedor' | 'banco' = 'proveedor';
  let fallaProveedor = '';

  if (config) {
    try {
      const provider = await getAIProviderForConfig(config);
      const messages: AIMessage[] = [{ role: 'user', content: texto }];
      const response = await provider.generateResponse(messages);
      content = response.content?.trim() ?? '';
    } catch (error) {
      // La cuota agotada del proveedor del equipo no es un error del pedido:
      // hay un banco de keys de Gemini justo para esto. Cualquier otra falla
      // también cae al banco antes de darse por vencida.
      fallaProveedor = error instanceof Error ? error.message : String(error);
      if (!esErrorDeCuota(error)) console.error('Proveedor de IA del equipo falló al redactar:', fallaProveedor);
    }
  }

  if (!content) {
    const banco = await analizarTextoConBanco({
      teamId,
      prompt: texto,
      automatico: false,
      // Redactar no es analizar: con temperatura 0 "cambiar otra vez" devolvía
      // siempre el mismo texto.
      temperatura: 0.9,
    });
    if (banco.ok) {
      content = banco.texto.trim();
      via = 'banco';
    } else {
      const detalle = config ? banco.error : 'El equipo no tiene proveedor de IA configurado.';
      throw new DraftError(
        `No se pudo redactar con IA: ${detalle} Podés escribir el mensaje a mano y aprobarlo igual.`,
        banco.reintentable ? 429 : 502,
      );
    }
  }

  if (!content) throw new DraftError('La IA devolvió un borrador vacío.', 502);

  return {
    content,
    draftType,
    metadata: { prompt, mode, via, generatedAt: new Date().toISOString() },
  };
}
