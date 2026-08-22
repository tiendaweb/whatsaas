import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { deleteFolder, FolderError, moveFolder, updateFolder } from '@/lib/plugins/documents/server/folders';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('documentsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Carpeta inválida.' }, { status: 400 });

  const body = await request.json().catch(() => ({}));

  try {
    // Mover es una operación aparte: valida ciclos y profundidad antes de tocar nada.
    if ('parentId' in body) {
      await moveFolder({
        teamId: ctx.team.id,
        id,
        parentId: body.parentId === null ? null : Number(body.parentId),
      });
    }

    if (body.name !== undefined || body.emoji !== undefined) {
      return NextResponse.json(
        await updateFolder({ teamId: ctx.team.id, id, name: body.name, emoji: body.emoji }),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FolderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('documentsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Carpeta inválida.' }, { status: 400 });

  try {
    await deleteFolder(ctx.team.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FolderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
