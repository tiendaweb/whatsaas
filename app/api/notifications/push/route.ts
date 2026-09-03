import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { pushSubscriptions } from '@/lib/db/schema';
import { getTeamForUser, getUser } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

const schema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(5) }),
  userAgent: z.string().max(300).optional(),
});

/** POST → guarda (o refresca) la suscripción de push de este navegador. */
export async function POST(request: NextRequest) {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 });
  const { endpoint, keys, userAgent } = parsed.data;
  await db
    .insert(pushSubscriptions)
    .values({ teamId: team.id, userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? null, lastUsedAt: new Date() })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { teamId: team.id, userId: user.id, p256dh: keys.p256dh, auth: keys.auth, lastUsedAt: new Date() } });
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** DELETE → el navegador dejó de querer avisos. */
export async function DELETE(request: NextRequest) {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 });
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
  return NextResponse.json({ ok: true });
}
