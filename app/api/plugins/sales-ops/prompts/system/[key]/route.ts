import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { saveSystemPromptVersion } from '@/lib/plugins/sales-ops/server/system-prompts';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  systemPrompt: z.string().min(20).max(60_000),
  userTemplate: z.string().min(3).max(60_000),
  notes: z.string().max(2000).nullable().optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Body inválido.' }, { status: 400 });
  const { key } = await params;
  try {
    return NextResponse.json(await saveSystemPromptVersion(ctx.team.id, ctx.user.id, { key: decodeURIComponent(key), ...parsed.data }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo guardar.';
    return NextResponse.json({ error: message }, { status: /otra ventana/.test(message) ? 409 : 422 });
  }
}
