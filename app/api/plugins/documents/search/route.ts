import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { searchDocuments } from '@/lib/plugins/documents/server/documents';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getPluginRequestContext('documentsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const query = new URL(request.url).searchParams.get('q') ?? '';
  return NextResponse.json(await searchDocuments(ctx.team.id, query));
}
