import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getDesktopLayout, saveDesktopLayout } from '@/lib/desktop/preferences';
import { DESKTOP_WIDGET_IDS } from '@/lib/desktop/types';

const widget = z.enum(DESKTOP_WIDGET_IDS);
const layoutSchema = z.object({
  version: z.literal(1).default(1),
  order: z.array(widget),
  pinned: z.array(widget),
  hidden: z.array(widget),
});

export async function GET() {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getDesktopLayout(context.teamId, context.userId));
}

export async function PATCH(request: Request) {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = layoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid layout', details: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await saveDesktopLayout(context.teamId, context.userId, parsed.data));
}
