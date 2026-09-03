import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { contacts, chats, funnelStages } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { eq, and, ilike, or, isNotNull } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const ctx = await getPluginRequestContext('scheduledMessagesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const stageId = searchParams.get('stageId');

  const conditions: Parameters<typeof and>[0][] = [
    eq(contacts.teamId, ctx.team.id),
    isNotNull(chats.remoteJid),
  ];

  if (stageId && stageId !== 'all') {
    conditions.push(eq(contacts.funnelStageId, Number(stageId)));
  }

  if (q) {
    conditions.push(
      or(
        ilike(contacts.name, `%${q}%`),
        ilike(chats.remoteJid, `%${q}%`),
      )!
    );
  }

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      remoteJid: chats.remoteJid,
      funnelStageId: contacts.funnelStageId,
    })
    .from(contacts)
    .innerJoin(chats, eq(contacts.chatId, chats.id))
    .where(and(...conditions))
    .orderBy(contacts.name)
    .limit(50);

  const phone = (jid: string) => jid.replace(/@s\.whatsapp\.net$/, '').replace(/@.*$/, '');

  return NextResponse.json(
    rows
      .filter(r => !r.remoteJid?.endsWith('@g.us')) // exclude groups
      .map(r => ({
        id: r.id,
        name: r.name,
        phone: phone(r.remoteJid ?? ''),
        jid: r.remoteJid,
        funnelStageId: r.funnelStageId,
      }))
  );
}
