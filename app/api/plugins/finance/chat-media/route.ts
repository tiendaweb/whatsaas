import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, isNotNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, messages } from '@/lib/db/schema';
import { resolveMediaUrl } from '@/lib/media-url';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function inferFileName(mediaUrl: string, caption: string | null, mimeType: string | null, timestamp: Date) {
  if (caption?.trim() && caption.trim().length <= 255) return caption.trim();
  try {
    const segment = decodeURIComponent(new URL(mediaUrl, 'https://local.invalid').pathname.split('/').filter(Boolean).pop() ?? '');
    if (segment.includes('.')) return segment.slice(0, 255);
  } catch {
    // Historical media URLs can be malformed; use a stable fallback.
  }
  const extension = mimeType === 'application/pdf' ? 'pdf' : (mimeType?.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg');
  return `comprobante-${timestamp.toISOString().slice(0, 10)}.${extension}`;
}

export async function GET() {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const rows = await db.select({
    messageId: messages.id,
    chatId: chats.id,
    chatName: chats.name,
    remoteJid: chats.remoteJid,
    mediaUrl: messages.mediaUrl,
    mimeType: messages.mediaMimetype,
    caption: messages.mediaCaption,
    timestamp: messages.timestamp,
  }).from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(and(
      eq(chats.teamId, ctx.team.id),
      isNotNull(messages.mediaUrl),
      or(
        ilike(messages.mediaMimetype, 'image/%'),
        eq(messages.mediaMimetype, 'application/pdf'),
        ilike(messages.mediaUrl, '%.pdf%'),
      ),
    ))
    .orderBy(desc(messages.timestamp))
    .limit(250);

  return NextResponse.json(rows.map((row) => ({
    ...row,
    mediaUrl: resolveMediaUrl(row.mediaUrl) || row.mediaUrl,
    fileName: inferFileName(row.mediaUrl!, row.caption, row.mimeType, row.timestamp),
  })));
}
