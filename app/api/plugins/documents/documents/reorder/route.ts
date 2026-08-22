import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { DocumentError, moveDocument } from '@/lib/plugins/documents/server/documents';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('documentsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  const position = Number(body.position);
  const folderId = body.folderId === null ? null : Number(body.folderId);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 });
  }
  if (!Number.isInteger(position) || position < 0) {
    return NextResponse.json({ error: 'Posición inválida.' }, { status: 400 });
  }
  if (folderId !== null && (!Number.isInteger(folderId) || folderId <= 0)) {
    return NextResponse.json({ error: 'Carpeta inválida.' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await moveDocument({ teamId: ctx.team.id, id, folderId, position }),
    );
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[documents/reorder POST]', error);
    return NextResponse.json({ error: 'No se pudo mover el documento.' }, { status: 500 });
  }
}
