import { NextResponse } from 'next/server';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { searchDesktop } from '@/lib/desktop/service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const query = new URL(request.url).searchParams.get('q') ?? '';
  try {
    return NextResponse.json(await searchDesktop(context, query));
  } catch (error) {
    console.error('[desktop] search failed', { teamId: context.teamId, userId: context.userId, error });
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
