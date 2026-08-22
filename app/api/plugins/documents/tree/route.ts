import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { listFolders } from '@/lib/plugins/documents/server/folders';
import { listDocuments } from '@/lib/plugins/documents/server/documents';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getPluginRequestContext('documentsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const [folders, documents] = await Promise.all([
    listFolders(ctx.team.id),
    listDocuments(ctx.team.id),
  ]);

  return NextResponse.json({ folders, documents });
}
