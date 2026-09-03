import { NextResponse } from 'next/server';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { getPrefs, sectoresDe } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic';

/**
 * Lo mínimo que el navegador necesita para saber si un chat es suyo: quién soy,
 * en qué sectores estoy y hasta dónde quiero que me avisen.
 *
 * Va aparte de `/prefs` porque esto lo pide cada pantalla del panel y aquello
 * trae el equipo entero.
 */
export async function GET() {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [prefs, sectores] = await Promise.all([getPrefs(team.id, user.id), sectoresDe(team.id, user.id)]);
  return NextResponse.json({
    userId: user.id,
    sectores,
    alcance: prefs.chatAlerts,
    pushEnabled: prefs.pushEnabled,
    vapid: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}
