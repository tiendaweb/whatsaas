import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocumentMedia, teamDocuments } from '@/lib/db/schema';

/**
 * Adjuntar una imagen a un documento, sin sesión.
 *
 * Estaba escrito adentro de `app/api/plugins/documents/media/route.ts`, atado a
 * un `FormData` y a las cookies. Por eso un informe con capturas no se podía
 * armar entero desde un conector: se escribía el texto por MCP y las imágenes
 * había que subirlas a mano desde el navegador.
 *
 * Acá recibe bytes y devuelve la fila. La route sigue siendo la dueña del
 * multipart; esta función es la dueña de la regla.
 */
export const DOCUMENT_MEDIA_ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export const DOCUMENT_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export type UploadDocumentMediaInput = {
  teamId: number;
  userId: number;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  documentId?: number | null;
};

export class DocumentMediaError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function uploadDocumentMedia(input: UploadDocumentMediaInput) {
  if (!DOCUMENT_MEDIA_ALLOWED_MIME.has(input.mimeType)) {
    throw new DocumentMediaError('Sólo se permiten imágenes (PNG, JPG, WEBP, GIF, AVIF).');
  }
  if (input.bytes.length > DOCUMENT_MEDIA_MAX_BYTES) {
    throw new DocumentMediaError('La imagen no puede superar los 8 MB.');
  }

  // Un documentId de otro equipo colgaría el adjunto de un documento ajeno: el
  // insert no lo impediría, porque `teamId` y `documentId` son dos columnas
  // independientes.
  let documentId: number | null = null;
  if (input.documentId != null) {
    const [document] = await db
      .select({ id: teamDocuments.id })
      .from(teamDocuments)
      .where(and(eq(teamDocuments.id, input.documentId), eq(teamDocuments.teamId, input.teamId)))
      .limit(1);
    if (!document) throw new DocumentMediaError('El documento no existe en este equipo.', 404);
    documentId = document.id;
  }

  const extension = (input.fileName.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const filename = `${uuidv4()}.${extension || 'png'}`;

  const relativeDir = path.join('uploads', 'documents', String(input.teamId));
  const absoluteDir = path.join(process.cwd(), 'public', relativeDir);

  await fs.mkdir(absoluteDir, { recursive: true });
  await fs.writeFile(path.join(absoluteDir, filename), input.bytes);

  // Mismo criterio que las demás apps: los adjuntos viven en /public y se sirven estáticos.
  const url = `/${relativeDir.replaceAll(path.sep, '/')}/${filename}`;

  const [media] = await db
    .insert(teamDocumentMedia)
    .values({
      teamId: input.teamId,
      documentId,
      url,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.length,
      createdBy: input.userId,
    })
    .returning();

  return media;
}
