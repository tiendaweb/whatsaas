/**
 * Aviso a Reyna: "quedan N decisiones sin tocar en Modo Noelia".
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env \
 *     scripts/aviso-reyna-modo-noelia.mts
 *
 * Es CONDICIONAL: cuenta las filas que siguen en `proposed` de los lotes
 * "Noelia · …" y **sólo escribe si queda alguna**. Si Reyna ya las resolvió, no
 * manda nada y sale en silencio: un recordatorio que llega igual cuando el
 * trabajo ya está hecho es ruido, y a la tercera vez se ignoran todos.
 *
 * `DRY_RUN=1` imprime lo que mandaría sin mandarlo.
 */
import { and, eq, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamCommercialActions, teamCommercialAnalysis } from '@/lib/db/schema';
import { sendTeamTextMessage } from '@/lib/messaging/send';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
const JID = process.env.AVISO_JID ?? '5491127137279@s.whatsapp.net';
const ETIQUETA = 'Noelia · %';

const [fila] = await db
  .select({
    pendientes: sql<number>`count(*)::int`,
    dinero: sql<number>`count(*) filter (where ${teamCommercialAnalysis.currentGate} in ('G8','G9','G10'))::int`,
    usd: sql<number>`coalesce(sum(${teamCommercialAnalysis.potentialValueUsd}), 0)::int`,
  })
  .from(teamCommercialActions)
  .innerJoin(
    teamCommercialAnalysis,
    and(eq(teamCommercialAnalysis.teamId, teamCommercialActions.teamId), eq(teamCommercialAnalysis.chatId, teamCommercialActions.chatId)),
  )
  .where(and(eq(teamCommercialActions.teamId, TEAM), eq(teamCommercialActions.status, 'proposed'), like(teamCommercialActions.batchLabel, ETIQUETA)));

const pendientes = fila?.pendientes ?? 0;
if (!pendientes) {
  console.log('Nada pendiente: no se avisa.');
  process.exit(0);
}

const texto = [
  `Buen día Reyna 👋 Te quedan *${pendientes} decisiones* listas en Modo Noelia, ya con el mensaje escrito.`,
  '',
  `${fila.dinero} son de la cola *💰 Dinero ahora* — son los que están más cerca de pagar. En total hay unos US$ ${fila.usd.toLocaleString('es-AR')} en juego.`,
  '',
  'Entrás por WhatsPro → Command Center Comercial → ⚡ Modo Noelia. Te muestra un cliente por vez: leés y apretás un botón.',
  '',
  'Acordate: ENVIAR AHORA manda el mensaje en el momento. Si dudás, PROGRAMAR o A LA COLA.',
].join('\n');

if (process.env.DRY_RUN === '1') {
  console.log(`[DRY_RUN] a ${JID}:\n\n${texto}\n`);
  process.exit(0);
}

// Clave por día: si el cron se dispara dos veces, Reyna recibe un solo aviso.
const dia = new Date().toISOString().slice(0, 10);
const res = await sendTeamTextMessage(TEAM, {
  recipientJid: JID,
  text: texto,
  origin: 'automation',
  idempotencyKey: `aviso-modo-noelia:${dia}`,
});

console.log(res.ok ? `Aviso enviado (${pendientes} pendientes).` : `No se pudo enviar: ${res.errorMessage ?? 'sin detalle'}`);
process.exit(res.ok ? 0 : 1);
