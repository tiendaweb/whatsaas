import 'server-only';

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { getTenantId } from '@/lib/tenant/context';
import { isTerminalOperator } from '@/lib/terminal/access';

/**
 * La puerta del Centro de Desarrollo. Dos cerrojos independientes, los dos
 * obligatorios: (1) la lista blanca de las terminales —la misma persona que
 * puede abrir una shell root es la que puede darle misiones a un agente— y
 * (2) el plugin `dev-center` activo para ESE usuario (activación por persona
 * en `team_member_plugins`). Sesión impersonada, no. Marca blanca, no.
 *
 * Cualquier falla devuelve 404 y no 403: quien no tiene acceso no tiene por
 * qué saber que el módulo existe.
 */
export type PuertaOk = { user: { id: number; email: string; name: string | null }; teamId: number };

export async function puertaDevCenter(): Promise<{ ok: true } & PuertaOk | { ok: false; error: NextResponse }> {
  const cerrada = { ok: false as const, error: NextResponse.json({ error: 'No encontrado.' }, { status: 404 }) };
  if (await getTenantId()) return cerrada;
  const [user, session, team] = await Promise.all([getUser(), getSession().catch(() => null), getTeamForUser()]);
  if (!user || !session || session.impersonatedBy || !team) return cerrada;
  if (!isTerminalOperator(user)) return cerrada;
  const activos = await resolveActivePluginsForTeam(team.id, user.id);
  if (!activos.some((plugin) => plugin.pluginId === 'dev-center')) return cerrada;
  return { ok: true, user: { id: user.id, email: user.email, name: user.name ?? null }, teamId: team.id };
}
