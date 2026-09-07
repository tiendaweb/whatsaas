import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getSession } from '@/lib/auth/session';
import { getTenantId } from '@/lib/tenant/context';
import { gatewayUrl, internalHeaders, isTerminalOperator, terminalRegistry } from '@/lib/terminal/access';

export const dynamic = 'force-dynamic';

/**
 * Lo que la pantalla necesita saber además de la terminal en sí: qué
 * proyectos hay, qué conexiones están vivas en el gateway, y cerrar una de
 * verdad (matar la sesión tmux). Todo pasa por la misma puerta que el ticket,
 * menos la contraseña: mirar la lista no abre nada.
 */
async function puerta() {
  if (await getTenantId()) return { error: NextResponse.json({ error: 'No encontrado.' }, { status: 404 }) };
  const [user, session] = await Promise.all([getUser(), getSession().catch(() => null)]);
  if (!user || !session) return { error: NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }) };
  if (session.impersonatedBy || !isTerminalOperator(user)) return { error: NextResponse.json({ error: 'No tenés acceso a las terminales.' }, { status: 403 }) };
  return { user };
}

async function gateway(path: string, init?: RequestInit) {
  const response = await fetch(`${gatewayUrl()}${path}`, { ...init, headers: { ...internalHeaders(), ...(init?.headers ?? {}) }, cache: 'no-store', signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`gateway ${response.status}`);
  return response.json();
}

export async function GET() {
  const p = await puerta();
  if ('error' in p) return p.error;
  const registry = terminalRegistry();
  let sessions: unknown[] = [];
  let gatewayOk = true;
  try {
    const body = await gateway('/sessions') as { sessions: Array<{ uid: number }> };
    // Cada operador ve sólo sus conexiones: la lista blanca es de una persona hoy, pero mañana no.
    sessions = body.sessions.filter((s) => s.uid === p.user.id);
  } catch {
    gatewayOk = false;
  }
  return NextResponse.json({
    projects: registry.projects.map(({ slug, name, cwd, stack, productionUrl, defaultBranch, agents, defaultAgent, maxSessions, commands }) => ({ slug, name, cwd, stack, productionUrl, defaultBranch, agents, defaultAgent, maxSessions, commands })),
    agents: registry.agents,
    sessions,
    gatewayOk,
  });
}

const killSchema = z.object({ tmux: z.string().regex(/^wp-\d+-[a-z0-9-]+-\d+$/) });

export async function DELETE(request: NextRequest) {
  const p = await puerta();
  if ('error' in p) return p.error;
  const parsed = killSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 400 });
  // Sólo las propias: el nombre de la sesión tmux lleva el id del usuario.
  if (!parsed.data.tmux.startsWith(`wp-${p.user.id}-`)) return NextResponse.json({ error: 'Esa sesión no es tuya.' }, { status: 403 });
  try {
    const body = await gateway(`/sessions/${parsed.data.tmux}`, { method: 'DELETE' });
    const [member] = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, p.user.id)).limit(1);
    await db.insert(activityLogs).values({ teamId: member?.teamId ?? null, userId: p.user.id, action: 'TERMINAL_SESSION_KILLED', metadata: { tmux: parsed.data.tmux }, ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null }).catch(() => undefined);
    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo cerrar la sesión.' }, { status: 502 });
  }
}
