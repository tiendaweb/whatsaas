import { NextResponse } from 'next/server';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { listActivity } from '@/lib/desktop/activity';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limit = Number(new URL(request.url).searchParams.get('limit')) || 20;
  return NextResponse.json({ activity: await listActivity(context.teamId, limit) });
}
