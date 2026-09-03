import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { deleteAppMakerAttachment, resolveAppMakerAttachment } from '@/lib/plugins/app-maker/server/attachments';
import { appMakerDataError, getAppMakerDataRequestContext } from '@/lib/plugins/app-maker/server/request';

export const dynamic = 'force-dynamic';

function attachmentId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error('invalid_attachment_id');
  return id;
}

function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; attachmentId: string }> }) {
  const route = await params;
  const access = await getAppMakerDataRequestContext({ request, slug: route.slug, permission: 'miniAppsRead' });
  if (!access.ok) return access.response;
  try {
    const attachment = await resolveAppMakerAttachment({ app: access.app, definition: access.definition, attachmentId: attachmentId(route.attachmentId), context: access.dataContext });
    return new Response(Readable.toWeb(attachment.stream) as ReadableStream, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(attachment.sizeBytes),
        'Content-Disposition': contentDisposition(attachment.fileName),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return appMakerDataError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; attachmentId: string }> }) {
  const route = await params;
  const access = await getAppMakerDataRequestContext({ request, slug: route.slug, permission: 'miniAppsWrite' });
  if (!access.ok) return access.response;
  try {
    await deleteAppMakerAttachment({ app: access.app, definition: access.definition, attachmentId: attachmentId(route.attachmentId), context: access.dataContext });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return appMakerDataError(error);
  }
}
