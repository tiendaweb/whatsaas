import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listSystemPromptDocuments, SYSTEM_PROMPT_MODULES } from '@/lib/plugins/sales-ops/server/system-prompts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  try {
    return NextResponse.json({ teamId: ctx.team.id, modules: SYSTEM_PROMPT_MODULES, prompts: await listSystemPromptDocuments(ctx.team.id) });
  } catch (error) {
    console.error('[sales-ops/system-prompts]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron leer los prompts.' }, { status: 500 });
  }
}
