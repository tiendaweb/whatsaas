import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { syncAdAccount } from '@/lib/ads/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bodySchema = z.object({ since: isoDate.optional(), until: isoDate.optional() }).default({});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('metaAdsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Cuenta inválida.' }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Rango inválido.' }, { status: 400 });

  try {
    const summary = await syncAdAccount({
      teamId: ctx.team.id,
      adAccountRowId: id,
      trigger: 'manual',
      since: parsed.data.since,
      until: parsed.data.until,
      startedBy: ctx.user.id,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo sincronizar.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
