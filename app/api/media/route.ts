import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { and, eq, or } from 'drizzle-orm';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { aiTools, chats, messages, teamTaskMedia } from '@/lib/db/schema';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
};

export const dynamic = 'force-dynamic';

// uploads/social/ es público porque Meta debe poder descargar el media para
// publicarlo en Instagram/Facebook; los nombres de archivo son aleatorios (no enumerables).
const PUBLIC_UPLOAD_PREFIXES = ['uploads/branding/', 'uploads/chat-theme/', 'uploads/social/'];
const MEDIA_RANGE_CHUNK_BYTES = 8 * 1024 * 1024;

async function canReadPrivateMedia(normalizedPath: string) {
  const publicPath = `/${normalizedPath}`;

  const context = await getUserPermissionContext();
  if (!context) {
    return false;
  }

  if (normalizedPath.startsWith('uploads/automation/')) {
    return context.permissions.automation === true;
  }

  if (normalizedPath.startsWith('uploads/ai-attachments/')) {
    return context.permissions.aiAgent === true;
  }

  if (normalizedPath.startsWith('uploads/tasks/')) {
    if (context.permissions.tasksRead !== true) return false;
    const [taskMediaMatch] = await db
      .select({ id: teamTaskMedia.id })
      .from(teamTaskMedia)
      .where(
        and(
          eq(teamTaskMedia.teamId, context.teamId),
          or(eq(teamTaskMedia.url, publicPath), eq(teamTaskMedia.url, normalizedPath)),
        ),
      )
      .limit(1);
    return Boolean(taskMediaMatch);
  }

  if (normalizedPath.startsWith('uploads/customers/')) {
    if (context.permissions.customersRead !== true) return false;
    const [customerMediaMatch] = await db
      .select({ id: teamTaskMedia.id })
      .from(teamTaskMedia)
      .where(
        and(
          eq(teamTaskMedia.teamId, context.teamId),
          eq(teamTaskMedia.ownerType, 'customer'),
          or(eq(teamTaskMedia.url, publicPath), eq(teamTaskMedia.url, normalizedPath)),
        ),
      )
      .limit(1);
    return Boolean(customerMediaMatch);
  }

  const [messageMatch] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(
      and(
        eq(chats.teamId, context.teamId),
        or(eq(messages.mediaUrl, publicPath), eq(messages.mediaUrl, normalizedPath)),
      ),
    )
    .limit(1);

  if (messageMatch) return true;

  const [toolMatch] = await db
    .select({ id: aiTools.id })
    .from(aiTools)
    .where(
      and(
        eq(aiTools.teamId, context.teamId),
        or(eq(aiTools.mediaUrl, publicPath), eq(aiTools.mediaUrl, normalizedPath)),
      ),
    )
    .limit(1);

  return Boolean(toolMatch);
}

export async function GET(request: NextRequest) {
  try {
    const relativePath = request.nextUrl.searchParams.get('path') || request.headers.get('x-media-path');

    if (!relativePath) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    const normalized = path.posix.normalize(relativePath.replace(/\\/g, '/')).replace(/^\/+/, '');

    // `includes('..')` rechazaba nombres de archivo legítimos: hay media
    // guardada como `…_04_42_12_p.m..png`. Lo que puede escapar del directorio
    // es un SEGMENTO igual a `..`, no la subcadena. Igual queda la verificación
    // de contención contra `publicRoot` unas líneas más abajo.
    if (!normalized.startsWith('uploads/') || normalized.split('/').includes('..')) {
      return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
    }

    const isPublicUpload = PUBLIC_UPLOAD_PREFIXES.some((prefix) => normalized.startsWith(prefix));
    if (!isPublicUpload) {
      const canRead = await canReadPrivateMedia(normalized);
      if (!canRead) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const publicRoot = path.resolve(process.cwd(), 'public');
    const absolutePath = path.resolve(publicRoot, normalized);
    if (!absolutePath.startsWith(`${publicRoot}${path.sep}`)) {
      return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
    }

    const extension = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';
    const stats = await fs.stat(absolutePath);
    const rangeHeader = request.headers.get('range');
    const cacheControl = isPublicUpload
      ? 'public, max-age=31536000, immutable'
      : 'private, no-store';

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (!match || (!match[1] && !match[2])) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stats.size}` },
        });
      }

      const suffixLength = !match[1] ? Number(match[2]) : null;
      const start = suffixLength == null
        ? Number(match[1])
        : Math.max(0, stats.size - suffixLength);
      const requestedEnd = match[1] && match[2] ? Number(match[2]) : stats.size - 1;
      const end = Math.min(requestedEnd, stats.size - 1, start + MEDIA_RANGE_CHUNK_BYTES - 1);

      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= stats.size || end < start) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stats.size}` },
        });
      }

      const length = end - start + 1;
      const fileHandle = await fs.open(absolutePath, 'r');
      const chunk = Buffer.allocUnsafe(length);
      try {
        await fileHandle.read(chunk, 0, length, start);
      } finally {
        await fileHandle.close();
      }

      return new NextResponse(chunk, {
        status: 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Content-Length': String(length),
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
        },
      });
    }

    const fileBuffer = await fs.readFile(absolutePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(stats.size),
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
      },
    });
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    console.error('Error serving media file:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
