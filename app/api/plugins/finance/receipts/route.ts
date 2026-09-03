import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { activityLogs, chats, messages, teamFinancialEntries, teamFinancialReceipts } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const receiptSchema = z.object({
  messageId: z.string().min(1).max(255),
  entryId: z.number().int().positive().nullable().optional(),
  documentDate: isoDate.nullable().optional(),
  paymentDate: isoDate.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  notes: z.string().max(3000).default(''),
});

export async function POST(request: Request) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = receiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [media] = await db.select({
    messageId: messages.id,
    chatId: chats.id,
    mediaUrl: messages.mediaUrl,
    mimeType: messages.mediaMimetype,
    caption: messages.mediaCaption,
    timestamp: messages.timestamp,
  }).from(messages).innerJoin(chats, eq(messages.chatId, chats.id)).where(and(eq(messages.id, parsed.data.messageId), eq(chats.teamId, ctx.team.id))).limit(1);
  if (!media?.mediaUrl) return NextResponse.json({ error: 'invalid_media' }, { status: 400 });
  const mediaUrl = media.mediaUrl;
  const isSupported = media.mimeType?.startsWith('image/') || media.mimeType === 'application/pdf' || /\.pdf(?:\?|$)/i.test(media.mediaUrl);
  if (!isSupported) return NextResponse.json({ error: 'unsupported_media' }, { status: 400 });

  if (parsed.data.entryId) {
    const entry = await db.query.teamFinancialEntries.findFirst({ where: and(eq(teamFinancialEntries.id, parsed.data.entryId), eq(teamFinancialEntries.teamId, ctx.team.id)), columns: { id: true } });
    if (!entry) return NextResponse.json({ error: 'invalid_entry' }, { status: 400 });
  }

  let fileName = media.caption?.trim() || null;
  if (!fileName) {
    try {
      fileName = decodeURIComponent(new URL(media.mediaUrl, 'https://local.invalid').pathname.split('/').filter(Boolean).pop() ?? '') || null;
    } catch {
      fileName = null;
    }
  }

  try {
    const [receipt] = await db.transaction(async (tx) => {
      const created = await tx.insert(teamFinancialReceipts).values({
        teamId: ctx.team.id,
        entryId: parsed.data.entryId ?? null,
        messageId: media.messageId,
        chatId: media.chatId,
        mediaUrl,
        mimeType: media.mimeType,
        fileName: fileName?.slice(0, 255) || `comprobante-${media.timestamp.toISOString().slice(0, 10)}`,
        documentDate: parsed.data.documentDate ?? null,
        paymentDate: parsed.data.paymentDate ?? null,
        tags: parsed.data.tags,
        notes: parsed.data.notes,
        createdBy: ctx.user.id,
      }).returning();
      await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_RECEIPT_LINKED', ipAddress: media.messageId.slice(0, 45) });
      return created;
    });
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === '23505') return NextResponse.json({ error: 'receipt_already_linked' }, { status: 409 });
    console.error('[finance receipts POST]', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
