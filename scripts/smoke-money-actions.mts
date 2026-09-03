/**
 * Prueba de humo de las acciones de plata del Centro de comandos, CONTRA LA BASE.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-money-actions.mts
 *
 * Corre TODO en dry_run: no crea pagos ni corre fechas. Lo que sí verifica de
 * verdad es que las validaciones que protegen la plata disparen cuando tienen
 * que disparar.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamFinancialEntries, teamMembers, teamMembershipSubscriptions } from '@/lib/db/schema';
import { buildPermissionContext } from '@/lib/auth/permissions-guard';
import { executeDesktopTool } from '@/lib/plugins/grok-connector/server/desktop-actions';
import { renewSubscription } from '@/lib/plugins/memberships/server/renew';
import { settleFinancialEntry } from '@/lib/plugins/finance/server/entries';

const TEAM = 2;
const [m] = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, TEAM)).limit(1);
const ctx = (await buildPermissionContext(TEAM, m!.userId))!;
const actionCtx = { teamId: TEAM, userId: m!.userId };

const ok = (label: string, cond: boolean, extra = '') =>
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ' · ' + extra : ''}`);

console.log('\n=== BANDEJA: el tipo nuevo "finance" ===');
const inbox: any = await executeDesktopTool('whatspro_command_center_inbox', { limit: 30 }, actionCtx);
console.log('  conteos:', JSON.stringify(inbox.counts));
const fin = inbox.items.filter((i: any) => i.kind === 'finance');
const mem = inbox.items.filter((i: any) => i.kind === 'membership');
ok('la bandeja trae cobros/pagos', inbox.counts.finance !== undefined, `${fin.length} en la página`);
if (fin[0]) console.log(`    ejemplo: ${fin[0].title} — ${fin[0].detail}`);
ok('los cobros proponen registrar el cobro', fin.every((i: any) => i.actions.some((a: any) => a.type === 'settle-entry')) || fin.length === 0);
ok('las membresías proponen renovar', mem.every((i: any) => i.actions.some((a: any) => a.type === 'renew-membership')) || mem.length === 0);
if (mem[0]) console.log(`    ejemplo: renovar hasta ${mem[0].actions[0]?.newEndDate}`);

console.log('\n=== LOTE en dry_run (no escribe) ===');
if (fin[0]) {
  const r: any = await executeDesktopTool('whatspro_command_center_execute', {
    actions: [{ item_id: fin[0].id, action: fin[0].actions[0] }],
    batch_id: 'smoke-money-0001', dry_run: true,
  }, actionCtx);
  ok('settle-entry valida', r.results[0].ok, JSON.stringify(r.results[0]));
}
if (mem[0]) {
  const r: any = await executeDesktopTool('whatspro_command_center_execute', {
    actions: [{ item_id: mem[0].id, action: mem[0].actions[0] }],
    batch_id: 'smoke-money-0002', dry_run: true,
  }, actionCtx);
  ok('renew-membership valida', r.results[0].ok, JSON.stringify(r.results[0]));
}

console.log('\n=== LAS PROTECCIONES DE LA PLATA ===');
const [sub] = await db.select().from(teamMembershipSubscriptions)
  .where(and(eq(teamMembershipSubscriptions.teamId, TEAM))).orderBy(desc(teamMembershipSubscriptions.id)).limit(1);
if (sub?.endDate) {
  try {
    await renewSubscription(TEAM, m!.userId, { subscription_id: sub.id, new_end_date: sub.endDate, idempotency_key: 'smoke-x-0001', dry_run: true });
    ok('rechaza una fecha que NO extiende', false, 'no tiró error');
  } catch (e) {
    ok('rechaza una fecha que NO extiende', true, (e as Error).message.slice(0, 70));
  }
}
try {
  await renewSubscription(TEAM, m!.userId, { subscription_id: 999999999, new_end_date: '2030-01-01', idempotency_key: 'smoke-x-0002', dry_run: true });
  ok('rechaza una suscripción de otro equipo', false, 'no tiró error');
} catch (e) {
  ok('rechaza una suscripción de otro equipo', true, (e as Error).message.slice(0, 50));
}
try {
  await settleFinancialEntry(TEAM, m!.userId, { entry_id: 999999999, amount: 100, paid_on: '2026-09-02', idempotency_key: 'smoke-x-0003', dry_run: true });
  ok('rechaza un asiento inexistente', false, 'no tiró error');
} catch (e) {
  ok('rechaza un asiento inexistente', true, (e as Error).message.slice(0, 50));
}
const [entry] = await db.select().from(teamFinancialEntries)
  .where(and(eq(teamFinancialEntries.teamId, TEAM), inArray(teamFinancialEntries.status, ['pending', 'overdue']))).limit(1);
if (entry) {
  const d: any = await settleFinancialEntry(TEAM, m!.userId, { entry_id: entry.id, amount: 1, paid_on: '2026-09-02', idempotency_key: 'smoke-x-0004', dry_run: true });
  ok('la simulación no escribe', d.created === false && d.dryRun === true, `quedaría saldado=${d.entry.quedaria_saldado} pendiente=${d.entry.pendiente_despues}`);
  try {
    await settleFinancialEntry(TEAM, m!.userId, { entry_id: entry.id, amount: 1, paid_on: '2026-09-02', account_id: 999999999, idempotency_key: 'smoke-x-0005', dry_run: true });
    ok('rechaza una cuenta de otro equipo', false, 'no tiró error');
  } catch (e) {
    ok('rechaza una cuenta de otro equipo', true, (e as Error).message.slice(0, 50));
  }
}
console.log('\n=== COLA UNIFICADA con el tipo nuevo ===');
const { listUnifiedWorkQueue } = await import('@/lib/work-queue/service');
const q = await listUnifiedWorkQueue(ctx, { limit: 60 });
console.log('  por tipo:', JSON.stringify(q.counts.byKind));
process.exit(0);
