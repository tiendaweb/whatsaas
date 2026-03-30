import { z } from 'zod';
import type { AIMessage } from '@/lib/plugins/ai-chat/types';
import { getAIProviderForTeam } from '@/lib/plugins/ai-chat/service';

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('El proveedor IA devolvió una respuesta vacía.');
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('La respuesta IA no contiene un objeto JSON válido.');
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

export async function generateStructuredObjectForTeam<T>(params: {
  teamId: number;
  schema: z.ZodType<T>;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}) {
  const ai = await getAIProviderForTeam(params.teamId);
  if (!ai) {
    throw new Error('El equipo no tiene proveedor IA configurado.');
  }

  const messages: AIMessage[] = [
    {
      role: 'system',
      content: [
        params.systemPrompt,
        'Responde EXCLUSIVAMENTE con un objeto JSON válido, sin markdown.',
      ].join('\n\n'),
    },
    {
      role: 'user',
      content: params.userPrompt,
    },
  ];

  const response = await ai.provider.generateResponse(messages);
  const raw = response.content ?? '';
  const jsonText = extractJsonObject(raw);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    throw new Error('No se pudo parsear el JSON generado por IA.');
  }

  const validated = params.schema.safeParse(parsedJson);
  if (!validated.success) {
    throw new Error(`La salida IA no cumple el contrato: ${validated.error.issues[0]?.message ?? 'error desconocido'}`);
  }

  return {
    data: validated.data,
    raw,
    provider: ai.config.provider,
    model: ai.config.model,
  };
}
