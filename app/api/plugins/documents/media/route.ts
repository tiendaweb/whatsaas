import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/drizzle';
import { teamDocumentMedia } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('documentsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const documentId = Number(formData.get('documentId'));

  if (!file) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 });
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Sólo se permiten imágenes (PNG, JPG, WEBP, GIF, AVIF).' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'La imagen no puede superar los 8 MB.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const filename = `${uuidv4()}.${extension || 'png'}`;

  const relativeDir = path.join('uploads', 'documents', String(ctx.team.id));
  const absoluteDir = path.join(process.cwd(), 'public', relativeDir);

  await fs.mkdir(absoluteDir, { recursive: true });
  await fs.writeFile(path.join(absoluteDir, filename), buffer);

  // Mismo criterio que las demás apps: los adjuntos viven en /public y se sirven estáticos.
  const url = `/${relativeDir.replaceAll(path.sep, '/')}/${filename}`;

  const [media] = await db
    .insert(teamDocumentMedia)
    .values({
      teamId: ctx.team.id,
      documentId: Number.isInteger(documentId) ? documentId : null,
      url,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      createdBy: ctx.user.id,
    })
    .returning();

  return NextResponse.json({ id: media.id, url: media.url }, { status: 201 });
}
