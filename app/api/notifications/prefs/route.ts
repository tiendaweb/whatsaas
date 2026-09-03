import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getPrefs, listarDestinatarios, listarGrupos, listarSectores, sectoresDe, setPrefs, setSector } from '@/lib/notifications/service';
import { ALCANCES_CHAT } from '@/lib/notifications/tipos';

export const dynamic = 'force-dynamic';

/**
 * Los ajustes de avisos: los míos, el equipo y los sectores.
 *
 * El equipo viene siempre porque el que manda necesita ver de un vistazo quién
 * quedó sin teléfono y quién sin sector: es el estado que hace que un aviso no
 * llegue, y sin verlo no se arregla.
 */
export async function GET() {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await getUserPermissionContext();
  const [prefs, grupos, sectores, destinatarios, mis] = await Promise.all([
    getPrefs(team.id, user.id),
    listarGrupos(team.id),
    listarSectores(team.id),
    listarDestinatarios(team.id),
    sectoresDe(team.id, user.id),
  ]);
  return NextResponse.json({
    prefs,
    grupos,
    sectores,
    destinatarios,
    yo: { userId: user.id, sectores: mis, puedeEditarEquipo: ctx?.role === 'owner' || ctx?.role === 'admin' },
    vapid: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}

const schema = z.object({
  /** A quién le cambio los ajustes. Sólo dueño o admin pueden tocar a otro. */
  userId: z.number().int().positive().optional(),
  /** Sector (departamento) de la persona. `null` la deja sin sector. */
  sector: z.number().int().positive().nullable().optional(),
  whatsappPhone: z.string().max(40).nullable().optional(),
  whatsappEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inappEnabled: z.boolean().optional(),
  chatAlerts: z.enum(ALCANCES_CHAT).optional(),
  quietFrom: z.number().int().min(0).max(23).nullable().optional(),
  quietTo: z.number().int().min(0).max(23).nullable().optional(),
  kinds: z.record(z.string(), z.array(z.string())).optional(),
  groupJid: z.string().max(64).nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const { userId, sector, ...patch } = parsed.data;
  const destino = userId ?? user.id;
  if (destino !== user.id) {
    const ctx = await getUserPermissionContext();
    if (ctx?.role !== 'owner' && ctx?.role !== 'admin') return NextResponse.json({ error: 'Sólo el dueño del equipo puede cambiar los avisos de otra persona.' }, { status: 403 });
    const miembros = await listarDestinatarios(team.id);
    if (!miembros.some((m) => m.userId === destino)) return NextResponse.json({ error: 'Esa persona no está en el equipo.' }, { status: 404 });
  }

  const prefs = Object.keys(patch).length ? await setPrefs(team.id, destino, patch) : await getPrefs(team.id, destino);
  if (sector !== undefined) await setSector(team.id, destino, sector);
  const [destinatarios, sectores] = await Promise.all([listarDestinatarios(team.id), listarSectores(team.id)]);
  return NextResponse.json({ prefs, destinatarios, sectores });
}
