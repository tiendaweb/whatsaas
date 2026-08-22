import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { createDocument, DocumentError, listDocuments } from '@/lib/plugins/documents/server/documents';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getPluginRequestContext('documentsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  return NextResponse.json(await listDocuments(ctx.team.id));
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('documentsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));

  try {
    const document = await createDocument({
      teamId: ctx.team.id,
      userId: ctx.user.id,
      title: body.title,
      emoji: body.emoji ?? null,
      folderId: body.folderId ? Number(body.folderId) : null,
      content: body.content,
    });
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
