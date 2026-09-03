import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { metaAdAccounts } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    syncEnabled: z.boolean().optional(),
    visible: z.boolean().optional(),
    taxRate: z.number().min(0).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nada para actualizar.' });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('metaAdsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Cuenta inválida.' }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.syncEnabled !== undefined) patch.syncEnabled = parsed.data.syncEnabled;
  if (parsed.data.visible !== undefined) patch.visible = parsed.data.visible;
  if (parsed.data.taxRate !== undefined) patch.taxRate = String(parsed.data.taxRate);

  const [updated] = await db
    .update(metaAdAccounts)
    .set(patch)
    .where(and(eq(metaAdAccounts.id, id), eq(metaAdAccounts.teamId, ctx.team.id)))
    .returning({
      id: metaAdAccounts.id,
      syncEnabled: metaAdAccounts.syncEnabled,
      visible: metaAdAccounts.visible,
      taxRate: metaAdAccounts.taxRate,
    });

  if (!updated) return NextResponse.json({ error: 'La cuenta no existe.' }, { status: 404 });

  return NextResponse.json({ ...updated, taxRate: Number(updated.taxRate) });
}
