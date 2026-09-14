import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildInstallmentSchedule, installmentDueDate } from '../../lib/plugins/finance/shared/financing';

test('reparte el total exacto aunque las cuotas tengan residuo', () => {
  const schedule = buildInstallmentSchedule({ totalAmount: 10_001, installmentCount: 3, firstDueOn: '2026-09-15', frequency: 'weekly' });
  assert.deepEqual(schedule.map((item) => item.amount), [3334, 3334, 3333]);
  assert.equal(schedule.reduce((sum, item) => sum + item.amount, 0), 10_001);
  assert.deepEqual(schedule.map((item) => item.dueOn), ['2026-09-15', '2026-09-22', '2026-09-29']);
});

test('calcula quincenas y conserva fin de mes en el calendario mensual', () => {
  assert.equal(installmentDueDate('2026-09-15', 'biweekly', 2), '2026-10-13');
  assert.deepEqual(
    [0, 1, 2].map((index) => installmentDueDate('2027-01-31', 'monthly', index)),
    ['2027-01-31', '2027-02-28', '2027-03-31'],
  );
});

test('rutas y tablas de financiación quedan aisladas por equipo y auditadas', async () => {
  const [schema, route, service, payments] = await Promise.all([
    readFile('lib/db/schema.ts', 'utf8'),
    readFile('app/api/plugins/finance/financing-plans/route.ts', 'utf8'),
    readFile('lib/plugins/finance/server/financing.ts', 'utf8'),
    readFile('app/api/plugins/finance/entries/[id]/payments/route.ts', 'utf8'),
  ]);
  assert.match(schema, /export const teamFinancingPlans = pgTable/);
  assert.match(schema, /export const teamFinancingInstallments = pgTable/);
  assert.match(route, /getFinanceRequestContext\('read'\)/);
  assert.match(route, /getFinanceRequestContext\('write'\)/);
  assert.match(service, /eq\(teamFinancingPlans\.teamId, teamId\)/);
  assert.match(service, /FINANCING_PLAN_CREATED/);
  assert.match(service, /FINANCING_PLAN_CANCELLED/);
  assert.match(payments, /payment_exceeds_outstanding/);
  assert.match(payments, /account_currency_mismatch/);
  assert.match(payments, /previousStatus: entry\.status/);
});
