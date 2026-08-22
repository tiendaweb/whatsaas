import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { createFolder, FolderError, listFolders } from '@/lib/plugins/documents/server/folders';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getPluginRequestContext('documentsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  return NextResponse.json(await listFolders(ctx.team.id));
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('documentsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));

  try {
    const folder = await createFolder({
      teamId: ctx.team.id,
      userId: ctx.user.id,
      name: String(body.name ?? ''),
      emoji: body.emoji ?? null,
      parentId: body.parentId ? Number(body.parentId) : null,
    });
    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    if (error instanceof FolderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
