import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { comparePasswords, getSession } from '@/lib/auth/session';
import { getTenantId } from '@/lib/tenant/context';
import { TICKET_TTL_MS, isTerminalOperator, mintTicket, terminalRegistry } from '@/lib/terminal/access';

export const dynamic = 'force-dynamic';

/**
 * Emite un ticket para abrir UNA terminal. Es la puerta de verdad del
 * Developer Command Center, así que acá se acumulan todas las verificaciones:
 *
 *   1. sesión válida y NO impersonada;
 *   2. email en la lista blanca (`isTerminalOperator`);
 *   3. la contraseña de nuevo, cada vez (una pestaña abierta en un bar no
 *      abre una shell root);
 *   4. proyecto y modo del registro, ranura dentro del límite del proyecto;
 *   5. tope de 10 tickets cada 10 minutos por usuario, y las contraseñas
 *      erradas cuentan doble;
 *   6. auditoría en `activity_logs` con proyecto, modo, ranura e IP.
 *
 * El ticket dura 45 s, sirve una sola vez y queda atado a la IP.
 */
const schema = z.object({
  project: z.string().min(1).max(40),
  mode: z.enum(['shell', 'claude', 'codex']),
  slot: z.number().int().min(1).max(8),
  password: z.string().min(1).max(200),
});

type Ventana = { hits: number[] };
const ventanas = new Map<number, Ventana>();
const LIMITE = 10;
const VENTANA_MS = 10 * 60_000;
function excedeLimite(userId: number, peso: number): boolean {
  const ahora = Date.now();
  const v = ventanas.get(userId) ?? { hits: [] };
  v.hits = v.hits.filter((t) => ahora - t < VENTANA_MS);
  for (let i = 0; i < peso; i += 1) v.hits.push(ahora);
  ventanas.set(userId, v);
  return v.hits.length > LIMITE;
}

const ipDe = (request: NextRequest) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;

async function auditar(userId: number, action: string, metadata: Record<string, unknown>, ip: string | null) {
  try {
    // El log cuelga de un equipo: el primero del usuario. La terminal es de la
    // persona, no del equipo, pero así aparece en el muro donde ya se mira.
    const [member] = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId)).limit(1);
    await db.insert(activityLogs).values({ teamId: member?.teamId ?? null, userId, action, metadata, ipAddress: ip });
  } catch (error) {
    console.error('[terminal/ticket audit]', error);
  }
}

export async function POST(request: NextRequest) {
  // El admin no existe en dominios de marca blanca; la terminal menos.
  if (await getTenantId()) return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
  const [user, session] = await Promise.all([getUser(), getSession().catch(() => null)]);
  const ip = ipDe(request);
  if (!user || !session) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
  if (session.impersonatedBy) {
    await auditar(user.id, 'TERMINAL_DENIED', { reason: 'impersonated', by: session.impersonatedBy.id }, ip);
    return NextResponse.json({ error: 'La terminal no se abre desde una sesión impersonada.' }, { status: 403 });
  }
  if (!isTerminalOperator(user)) {
    await auditar(user.id, 'TERMINAL_DENIED', { reason: 'not_allowed', email: user.email }, ip);
    return NextResponse.json({ error: 'No tenés acceso a las terminales.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  const { project, mode, slot, password } = parsed.data;

  if (excedeLimite(user.id, 1)) {
    await auditar(user.id, 'TERMINAL_DENIED', { reason: 'rate_limited' }, ip);
    return NextResponse.json({ error: 'Demasiados intentos. Esperá unos minutos.' }, { status: 429 });
  }
  const passwordOk = Boolean(user.passwordHash) && await comparePasswords(password, user.passwordHash);
  if (!passwordOk) {
    excedeLimite(user.id, 1);
    await auditar(user.id, 'TERMINAL_DENIED', { reason: 'bad_password', project }, ip);
    return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 403 });
  }
  const registry = terminalRegistry();
  const proyecto = registry.projects.find((p) => p.slug === project);
  if (!proyecto) return NextResponse.json({ error: 'Proyecto desconocido.' }, { status: 400 });
  if (slot > (proyecto.maxSessions || 4)) return NextResponse.json({ error: `Este proyecto admite ${proyecto.maxSessions} terminales.` }, { status: 400 });
  if (mode !== 'shell' && !proyecto.agents.includes(mode)) return NextResponse.json({ error: 'Ese agente no está habilitado para el proyecto.' }, { status: 400 });

  let ticket: string;
  try {
    ticket = mintTicket({ uid: user.id, email: user.email.toLowerCase(), project, mode, slot, ip });
  } catch (error) {
    console.error('[terminal/ticket]', error);
    return NextResponse.json({ error: 'La terminal no está configurada en este servidor.' }, { status: 503 });
  }
  await auditar(user.id, 'TERMINAL_TICKET_ISSUED', { project, mode, slot, cwd: proyecto.cwd, ttlMs: TICKET_TTL_MS }, ip);
  return NextResponse.json({ ticket, expiresInMs: TICKET_TTL_MS, wsPath: '/terminal-gateway/ws', project: proyecto.slug, cwd: proyecto.cwd });
}
