/**
 * Corrige la moneda de los planes y las suscripciones importados de AAPP SPACE.
 *
 *   # ver qué cambiaría, sin tocar nada:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/fix-aapp-currency.mts
 *   # aplicarlo:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/fix-aapp-currency.mts --aplicar
 *
 * QUÉ ARREGLA: hasta el 2026-09-03 el sync etiquetaba en `USD` toda la plata de
 * AAPP SPACE, porque la API no manda moneda y el default era el dólar. Los
 * importes SIEMPRE estuvieron bien (unidades × 100 = centavos); lo único torcido
 * es la etiqueta. «Sitio Web + Tienda Online» figura a USD 60.000/año cuando el
 * cliente paga ARS 60.000/año.
 *
 * QUÉ NO HACE: **no toca un solo importe**. Sólo reescribe `currency`. Convertir
 * de una moneda a otra sería inventar una cotización y perder el número que el
 * cliente realmente pagó.
 *
 * ALCANCE: sólo filas con `external_source = 'aapp_space'`, que son las que
 * escribió el sync con el default equivocado. Lo que cargó una persona a mano no
 * se toca aunque tenga la misma pinta: ahí no hubo un bug, hubo alguien
 * tecleando, y adivinarle la intención es otra cosa.
 */
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembershipPlans, teamMembershipSubscriptions } from '@/lib/db/schema';
import { formatMoneyFromCents } from '@/lib/format/money';

const APLICAR = process.argv.includes('--aplicar');
/** La misma que usa el sync. Un solo lugar donde está escrito el porqué. */
const MONEDA = (process.env.AAPP_SPACE_CURRENCY || 'ARS').toUpperCase();
const ORIGEN = 'aapp_space';

async function main() {
  console.log(`\nMoneda de AAPP SPACE → ${MONEDA}   ${APLICAR ? '(APLICANDO)' : '(simulación: no se escribe nada)'}\n`);

  const planes = await db
    .select({
      id: teamMembershipPlans.id,
      teamId: teamMembershipPlans.teamId,
      name: teamMembershipPlans.name,
      price: teamMembershipPlans.price,
      currency: teamMembershipPlans.currency,
    })
    .from(teamMembershipPlans)
    .where(and(eq(teamMembershipPlans.externalSource, ORIGEN), ne(teamMembershipPlans.currency, MONEDA)))
    .orderBy(teamMembershipPlans.price);

  console.log(`Planes a reetiquetar: ${planes.length}`);
  for (const plan of planes) {
    console.log(
      `  #${plan.id} equipo ${plan.teamId} · ${plan.name}` +
        `\n      ${formatMoneyFromCents(plan.price, plan.currency)}  →  ${formatMoneyFromCents(plan.price, MONEDA)}`,
    );
  }

  // Las suscripciones se resumen por moneda y plan: son cientos y listarlas una
  // por una no deja ver si el conjunto tiene sentido, que es lo que hay que
  // mirar antes de escribir en producción.
  const subs = await db
    .select({
      teamId: teamMembershipSubscriptions.teamId,
      currency: teamMembershipSubscriptions.currency,
      plan: teamMembershipSubscriptions.planNameSnapshot,
      n: sql<number>`count(*)::int`,
      total: sql<number>`sum(${teamMembershipSubscriptions.price})::bigint`,
    })
    .from(teamMembershipSubscriptions)
    .where(and(eq(teamMembershipSubscriptions.externalSource, ORIGEN), ne(teamMembershipSubscriptions.currency, MONEDA)))
    .groupBy(teamMembershipSubscriptions.teamId, teamMembershipSubscriptions.currency, teamMembershipSubscriptions.planNameSnapshot)
    .orderBy(sql`count(*) desc`);

  const totalSubs = subs.reduce((n, fila) => n + Number(fila.n), 0);
  console.log(`\nSuscripciones a reetiquetar: ${totalSubs}`);
  for (const fila of subs) {
    console.log(
      `  ${String(fila.n).padStart(4)} × ${fila.plan || '(sin plan)'} · equipo ${fila.teamId}` +
        `\n       ${formatMoneyFromCents(Number(fila.total), fila.currency)}  →  ${formatMoneyFromCents(Number(fila.total), MONEDA)}`,
    );
  }

  if (!APLICAR) {
    console.log('\nNada escrito. Volvé a correrlo con --aplicar para hacerlo efectivo.\n');
    return;
  }

  const planesTocados = await db
    .update(teamMembershipPlans)
    .set({ currency: MONEDA, updatedAt: new Date() })
    .where(and(eq(teamMembershipPlans.externalSource, ORIGEN), ne(teamMembershipPlans.currency, MONEDA)))
    .returning({ id: teamMembershipPlans.id });

  const subsTocadas = await db
    .update(teamMembershipSubscriptions)
    .set({ currency: MONEDA, updatedAt: new Date() })
    .where(and(eq(teamMembershipSubscriptions.externalSource, ORIGEN), ne(teamMembershipSubscriptions.currency, MONEDA)))
    .returning({ id: teamMembershipSubscriptions.id });

  console.log(`\nListo: ${planesTocados.length} planes y ${subsTocadas.length} suscripciones ahora en ${MONEDA}.`);
  console.log('Es idempotente: correrlo de nuevo no encuentra nada que cambiar.\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
