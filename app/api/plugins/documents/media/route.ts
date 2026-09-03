import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { DocumentMediaError, uploadDocumentMedia } from '@/lib/plugins/documents/server/media';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('documentsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const documentId = Number(formData.get('documentId'));

  if (!file) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 });

  try {
    const media = await uploadDocumentMedia({
      teamId: ctx.team.id,
      userId: ctx.user.id,
      fileName: file.name,
      mimeType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
      documentId: Number.isInteger(documentId) ? documentId : null,
    });
    return NextResponse.json({ id: media.id, url: media.url }, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentMediaError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
