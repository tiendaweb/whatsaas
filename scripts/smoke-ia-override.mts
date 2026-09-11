/**
 * El interruptor del equipo manda: smoke CONTRA LA BASE.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/smoke-ia-override.mts
 *
 * Lo que prueba es exactamente lo que falló el 2026-09-10 en Contratá Ya: con
 * el agente del equipo apagado, un chat donde la IA ya había contestado seguía
 * contestando, porque la sesión que el propio motor había creado se leía como
 * "acá la IA está prendida a propósito".
 *
 * No escribe nada: lee los estados reales y evalúa las funciones puras.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiConfigs, aiSessions, chats } from '@/lib/db/schema';
import { getEffectiveAIState, overrideDeSesion, shouldBlockAIProcessing } from '@/lib/ai/session-state';

let fallos = 0;
const ok = (nombre: string, condicion: boolean, detalle = '') => {
  console.log(`${condicion ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!condicion) fallos += 1;
};

// ── 1. Las cuatro combinaciones, en funciones puras ──────────────────────────
const sesionDelMotor = { status: 'active', isOverride: false };
const prendidoAMano = { status: 'active', isOverride: true };
const pausadoAMano = { status: 'paused', isOverride: true };

ok(
  'equipo apagado + sesión creada por el motor → NO contesta',
  shouldBlockAIProcessing(false, overrideDeSesion(sesionDelMotor)) === true,
  'éste es el bug que le escribió solo a un contacto personal',
);
ok('equipo apagado + chat prendido a mano → contesta', shouldBlockAIProcessing(false, overrideDeSesion(prendidoAMano)) === false);
ok('equipo prendido + chat pausado a mano → NO contesta', shouldBlockAIProcessing(true, overrideDeSesion(pausadoAMano)) === true);
ok('equipo prendido + sesión del motor → contesta', shouldBlockAIProcessing(true, overrideDeSesion(sesionDelMotor)) === false);
ok('equipo prendido + chat sin sesión → contesta', shouldBlockAIProcessing(true, overrideDeSesion(null)) === false);
ok('equipo apagado + chat sin sesión → NO contesta', shouldBlockAIProcessing(false, overrideDeSesion(null)) === true);

const heredado = getEffectiveAIState(false, overrideDeSesion(sesionDelMotor));
ok('un chat sin override dice que hereda', heredado.inheritsTeamStatus && !heredado.hasSession, `efectivo: ${heredado.effectiveStatus}`);

// ── 2. Contra los datos reales: nadie queda contestando con el bot apagado ───
const equipos = await db.select({ teamId: aiConfigs.teamId, isActive: aiConfigs.isActive }).from(aiConfigs);
for (const equipo of equipos) {
  const filas = await db
    .select({ status: aiSessions.status, isOverride: aiSessions.isOverride, n: sql<number>`count(*)::int` })
    .from(aiSessions)
    .innerJoin(chats, eq(chats.id, aiSessions.chatId))
    .where(and(eq(chats.teamId, equipo.teamId)))
    .groupBy(sql`1`, sql`2`);

  const contestan = filas
    .filter((f) => !shouldBlockAIProcessing(!!equipo.isActive, overrideDeSesion(f)))
    .reduce((acc, f) => acc + f.n, 0);
  const total = filas.reduce((acc, f) => acc + f.n, 0);

  if (equipo.isActive) {
    ok(`equipo ${equipo.teamId} (bot PRENDIDO): contestan ${contestan} de ${total}`, true, 'las pausas a mano se respetan');
  } else {
    const prendidosAMano = filas.filter((f) => f.isOverride && f.status === 'active').reduce((acc, f) => acc + f.n, 0);
    ok(
      `equipo ${equipo.teamId} (bot APAGADO): sólo contestan los ${prendidosAMano} prendidos a mano`,
      contestan === prendidosAMano,
      `${total} chats con sesión, ${contestan} contestarían`,
    );
  }
}

console.log(`\n${fallos === 0 ? 'Todo en verde' : `${fallos} chequeos fallaron`}`);
process.exit(fallos === 0 ? 0 : 1);
