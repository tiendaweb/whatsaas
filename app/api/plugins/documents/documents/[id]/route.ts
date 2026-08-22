import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import {
  deleteDocument,
  DocumentError,
  getDocument,
  listBacklinks,
  updateDocument,
} from '@/lib/plugins/documents/server/documents';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('documentsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 });

  const [document, backlinks] = await Promise.all([
    getDocument(ctx.team.id, id),
    listBacklinks(ctx.team.id, id),
  ]);

  if (!document) return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });

  return NextResponse.json({ ...document, backlinks });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('documentsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 });

  const body = await request.json().catch(() => ({}));

  try {
    const document = await updateDocument({
      teamId: ctx.team.id,
      userId: ctx.user.id,
      id,
      title: body.title,
      emoji: body.emoji,
      folderId: body.folderId === undefined ? undefined : body.folderId === null ? null : Number(body.folderId),
      content: body.content,
      format: body.format === 'html' ? 'html' : body.format === 'markdown' ? 'markdown' : undefined,
      htmlContent: typeof body.htmlContent === 'string' ? body.htmlContent : undefined,
      version: body.version === undefined ? undefined : Number(body.version),
    });
    return NextResponse.json(document);
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('documentsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 });

  try {
    await deleteDocument(ctx.team.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
