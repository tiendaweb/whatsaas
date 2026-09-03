import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { setItemPinned } from '@/lib/menu/service';

const pinSchema = z.object({
  itemKey: z.string().trim().min(1).max(160),
  pinned: z.boolean(),
}).strict();

export async function POST(request: NextRequest) {
  const { error, context } = await checkRoutePermission('settings');
  if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = pinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  await setItemPinned(context.teamId, parsed.data.itemKey, parsed.data.pinned, context.userId);

  return NextResponse.json({ success: true });
}
