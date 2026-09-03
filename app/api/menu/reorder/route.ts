import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { setMainNavOrder } from '@/lib/menu/service';

const reorderSchema = z.object({
  orderedKeys: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
}).strict();

export async function POST(request: NextRequest) {
  const { error, context } = await checkRoutePermission('settings');
  if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const uniqueKeys = Array.from(new Set(parsed.data.orderedKeys));
  await setMainNavOrder(context.teamId, uniqueKeys, context.userId);

  return NextResponse.json({ success: true });
}
