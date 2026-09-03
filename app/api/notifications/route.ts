import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { CANALES } from '@/lib/notifications/tipos';
import { listarBandeja, marcarLeidas, notify } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic';

/** GET → la bandeja de quien pregunta (lo suyo y lo del equipo). */
export async function GET(request: NextRequest) {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const items = await listarBandeja(team.id, user.id, { soloNoLeidas: sp.get('noLeidas') === '1', limit: Number(sp.get('limit')) || 30 });
  return NextResponse.json({ items, unread: items.filter((i) => !i.readAt).length });
}

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read'), ids: z.array(z.number().int().positive()).optional() }),
  z.object({
    action: z.literal('send'),
    userId: z.number().int().positive().nullable().optional(),
    departmentId: z.number().int().positive().nullable().optional(),
    title: z.string().min(1).max(180),
    body: z.string().max(4000).default(''),
    url: z.string().max(400).nullable().optional(),
    channels: z.array(z.enum(CANALES)).min(1).default(['inapp']),
    groupJid: z.string().max(64).nullable().optional(),
    scheduledFor: z.string().nullable().optional(),
    kind: z.string().max(50).default('manual'),
  }),
]);

/** POST → marca leídas, o manda un aviso a alguien / al equipo / a un grupo. */
export async function POST(request: NextRequest) {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  if (parsed.data.action === 'read') {
    return NextResponse.json({ leidas: await marcarLeidas(team.id, user.id, parsed.data.ids) });
  }
  const cuando = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null;
  const r = await notify({
    teamId: team.id,
    userId: parsed.data.userId === undefined ? user.id : parsed.data.userId,
    departmentId: parsed.data.departmentId ?? null,
    kind: parsed.data.kind,
    title: parsed.data.title,
    body: parsed.data.body,
    url: parsed.data.url ?? null,
    channels: parsed.data.channels,
    groupJid: parsed.data.groupJid ?? null,
    scheduledFor: cuando && Number.isFinite(cuando.getTime()) ? cuando : null,
    source: 'ui',
    createdBy: user.id,
  });
  return NextResponse.json(r, { status: 201 });
}
