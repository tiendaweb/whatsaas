import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { aiConfigs } from '@/lib/db/schema';
import { getAIProviderForConfig } from '@/lib/plugins/ai-chat/service';
import type { AIMessage } from '@/lib/plugins/ai-chat/types';

type GenerateMode = 'create' | 'rewrite' | 'variables';

export const dynamic = 'force-dynamic';

function resolveMode(value: unknown): GenerateMode {
  return value === 'rewrite' || value === 'variables' ? value : 'create';
}

function buildPrompt(params: { prompt: string; mode: GenerateMode; baseContent: string; draftType: 'static' | 'dynamic' }) {
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
    params.baseContent
      ? `Borrador base (puedes mejorarlo):\n${params.baseContent}`
      : null,
    `Instrucciones del usuario:\n${params.prompt}`,
    'Devuelve solo el contenido final del borrador, sin markdown ni explicaciones.',
  ].filter(Boolean);

  return sections.join('\n\n');
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) {
      return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const prompt = typeof (body as any)?.prompt === 'string' ? (body as any).prompt.trim() : '';
    const baseContent = typeof (body as any)?.baseContent === 'string' ? (body as any).baseContent.trim() : '';
    const draftType = (body as any)?.draftType === 'dynamic' ? 'dynamic' : 'static';
    const mode = resolveMode((body as any)?.mode);

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const config = await db.query.aiConfigs.findFirst({
      where: eq(aiConfigs.teamId, context.teamId),
    });

    if (!config) {
      return NextResponse.json({ error: 'AI provider is not configured for this team.' }, { status: 400 });
    }

    const provider = await getAIProviderForConfig(config);
    const input = buildPrompt({ prompt, mode, baseContent, draftType });
    const messages: AIMessage[] = [{ role: 'user', content: input }];

    const response = await provider.generateResponse(messages);
    const generatedContent = response.content?.trim() ?? '';

    if (!generatedContent) {
      return NextResponse.json({ error: 'The AI provider returned an empty draft.' }, { status: 502 });
    }

    return NextResponse.json({
      content: generatedContent,
      metadata: {
        prompt,
        mode,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating draft with AI:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
