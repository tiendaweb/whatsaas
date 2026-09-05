/**
 * Verifica los arreglos de seguridad y robustez del 2026-09-03, CONTRA LA BASE.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-seguridad.mts
 *
 * No escribe nada. Comprueba que lo que ANTES se podía hacer, ahora se rechace.
 */
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { evolutionInstances, teamMembers } from '@/lib/db/schema';
import { InstanceOwnershipError, assertTeamInstance, findTeamInstance } from '@/lib/instances/ownership';
import { formatMoney, normalizeCurrency } from '@/lib/format/money';

let ok = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ' · ' + extra : ''}`);
};

console.log('\n── Propiedad de instancias (fuga cross-tenant) ──');
const [mine] = await db.select().from(evolutionInstances).where(eq(evolutionInstances.teamId, 2)).limit(1);
const [alien] = await db.select().from(evolutionInstances).where(ne(evolutionInstances.teamId, 2)).limit(1);
check('la instancia propia se acepta', !!(mine && await findTeamInstance(2, mine.id)), mine ? `id ${mine.id}` : 'sin instancias');
if (alien) {
  check('la instancia de otro equipo se rechaza', (await findTeamInstance(2, alien.id)) === null, `id ${alien.id} del equipo ${alien.teamId}`);
  let tiro = false;
  try { await assertTeamInstance(2, alien.id); } catch (e) { tiro = e instanceof InstanceOwnershipError; }
  check('assertTeamInstance lanza con id ajeno', tiro);
} else {
  console.log('  – no hay instancias de otro equipo para probar (un solo tenant)');
}
check('un id inexistente se rechaza', (await findTeamInstance(2, 999999999)) === null);

console.log('\n── Formateo de moneda (RangeError que tumbaba pantallas) ──');
for (const mala of ['enable_disable_nfc_card_order_website', 'activate_plan_during_registeration', '', 'Gs', null, undefined]) {
  let crash = false, salida = '';
  try { salida = formatMoney(1234.5, mala as never); } catch { crash = true; }
  check(`no revienta con ${JSON.stringify(mala)}`, !crash, salida.slice(0, 24));
}
check('una moneda válida sigue formateando bien', formatMoney(1234.5, 'ARS').includes('1.23'), formatMoney(1234.5, 'ARS'));
check('normalizeCurrency limpia la basura', normalizeCurrency('enable_disable_nfc_card_order_website') === null);
check('normalizeCurrency normaliza a mayúsculas', normalizeCurrency('ars') === 'ARS');

console.log('\n── Datos: la columna currency quedó limpia ──');
const sucias: any = await db.execute(sql.raw(
  `select count(*) n from team_customer_transactions where currency is not null and currency !~ '^[A-Za-z]{3}$'`));
check('sin monedas inválidas en team_customer_transactions', Number((sucias.rows ?? sucias)[0].n) === 0);

console.log('\n── La tabla de reseteo de contraseña existe ──');
const t: any = await db.execute(sql.raw(
  `select count(*) n from information_schema.tables where table_name = 'password_reset_tokens'`));
check('password_reset_tokens existe', Number((t.rows ?? t)[0].n) === 1);

console.log('\n── Calendario: detección de choques de horario ──');
{
  const { overlappingEvents } = await import('@/lib/plugins/calendar/server/events');
  let crash: string | null = null;
  let filas = -1;
  try {
    const r = await overlappingEvents(2, new Date('2026-09-10T10:00:00Z'), new Date('2026-09-10T11:00:00Z'));
    filas = Array.isArray(r) ? r.length : -1;
  } catch (e) { crash = (e as Error).message.slice(0, 70); }
  check('overlappingEvents corre sin reventar', crash === null, crash ?? `${filas} solapados`);
}

console.log('\n── Fechas inválidas rechazadas por zod (antes eran 500) ──');
{
  const { z } = await import('zod');
  const esquema = z.string().datetime().nullable().optional();
  for (const mala of ['mañana 10:00', '10:10', '2026-13-45', '31/12/2026']) {
    check(`rechaza ${JSON.stringify(mala)}`, !esquema.safeParse(mala).success);
  }
  check('acepta un ISO válido', esquema.safeParse('2026-09-10T10:00:00.000Z').success);
}

console.log(`\n${ok} ok · ${fail} fallo(s)`);
process.exit(fail > 0 ? 1 : 0);
