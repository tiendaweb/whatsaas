/**
 * Smoke de cobros (Command Center), CONTRA LA BASE pero SIN escribir:
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-cobros.mts
 *
 * Prueba `parsearImporte` (los formatos que escribe una persona) y
 * `registrarCobro` con `dryRun` sobre un chat real del equipo 2 que tenga
 * contacto, más `deudaDelContacto`. No registra nada.
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts } from '@/lib/db/schema';
import { deudaDelContacto, parsearImporte, registrarCobro } from '@/lib/plugins/sales-ops/server/cobros';

const TEAM = 2;
let fallas = 0;
const check = (nombre: string, ok: boolean, detalle?: unknown) => {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ''}`);
  if (!ok) fallas += 1;
};

const casos: Array<[unknown, number | null]> = [
  ['50000', 50000], ['50.000', 50000], ['50,000', 50000], ['1.500.000', 1500000], ['45,5', 45.5], ['45.50', 45.5],
  ['$ 200.000', 200000], ['1,234.56', 1234.56], ['1.234,56', 1234.56], ['abc', null], ['0', null], [12.5, 12.5],
];
for (const [entrada, esperado] of casos) check(`parsearImporte(${JSON.stringify(entrada)}) = ${esperado}`, parsearImporte(entrada) === esperado, parsearImporte(entrada));

const [contacto] = await db.select({ id: contacts.id, chatId: contacts.chatId, name: contacts.name }).from(contacts).where(and(eq(contacts.teamId, TEAM), isNotNull(contacts.chatId))).limit(1);
if (!contacto?.chatId) {
  console.log('Sin contacto con chat en el equipo 2: no se puede probar el dry run.');
} else {
  const dry = await registrarCobro(TEAM, 1, { chatId: contacto.chatId, amount: 12345.67, currency: 'ars', method: 'transferencia', concept: 'Smoke', idempotencyKey: `smoke-cobros-${Date.now()}`, dryRun: true });
  check('dryRun no escribe y resume', dry.dryRun === true && dry.amountCents === 1234567 && dry.currency === 'ARS', dry.summary);
  const deuda = await deudaDelContacto(TEAM, { chatId: contacto.chatId });
  check('deudaDelContacto responde', Array.isArray(deuda.pendingSales) && Array.isArray(deuda.pendingEntries), { pendientes: deuda.pendingSales.length, asientos: deuda.pendingEntries.length, pagos: deuda.paid.length });
  try {
    await registrarCobro(TEAM, 1, { chatId: contacto.chatId, amount: 10, currency: 'pesos', idempotencyKey: 'smoke-cobros-moneda', dryRun: true });
    check('moneda inválida rechazada', false);
  } catch (e) {
    check('moneda inválida rechazada', /3 letras/.test(String((e as Error).message)));
  }
}
console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
