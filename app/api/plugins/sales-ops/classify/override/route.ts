import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { setManualOverride } from '@/lib/plugins/sales-ops/server/classifier';
import { DossierError } from '@/lib/plugins/sales-ops/server/dossier';
import { ANALYSIS_STATUSES, GATES } from '@/lib/plugins/sales-ops/shared/taxonomy';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  chatId: z.number().int().positive(),
  gate: z.enum(GATES),
  status: z.enum(ANALYSIS_STATUSES),
  reason: z.string().trim().min(3).max(300),
});

/** POST { chatId, gate, status, reason } → versión manual_override (analyzedBy='human'). */
export async function POST(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const teamId = ctx.team.id;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Body inválido: se espera { chatId, gate, status, reason (≥3 caracteres) }' }, { status: 400 });
  }

  try {
    const result = await setManualOverride(teamId, parsed.data.chatId, ctx.user.id, {
      gate: parsed.data.gate,
      status: parsed.data.status,
      reason: parsed.data.reason,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DossierError) return NextResponse.json({ error: error.message }, { status: error.code === 'not_found' ? 404 : 422 });
    console.error('[sales-ops/classify/override]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
