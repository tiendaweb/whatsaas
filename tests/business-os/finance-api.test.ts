import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path: string) {
  return readFile(path, 'utf8');
}

test('las rutas de cuentas financieras usan getFinanceRequestContext y filtran por ctx.team.id', async () => {
  const list = await read('app/api/plugins/finance/accounts/route.ts');
  const byId = await read('app/api/plugins/finance/accounts/[id]/route.ts');
  for (const source of [list, byId]) {
    assert.match(source, /getFinanceRequestContext\('write'\)|getFinanceRequestContext\('read'\)/);
    assert.match(source, /eq\(teamFinancialAccounts\.teamId, ctx\.team\.id\)/);
  }
});

test('DELETE de cuenta financiera bloquea con 409 si tiene entries o pagos vinculados (no permite borrar en uso)', async () => {
  const byId = await read('app/api/plugins/finance/accounts/[id]/route.ts');
  const deleteFnStart = byId.indexOf('export async function DELETE');
  assert.ok(deleteFnStart >= 0, 'no se encontró el handler DELETE');
  const deleteFn = byId.slice(deleteFnStart);
  assert.match(deleteFn, /eq\(teamFinancialEntries\.accountId, id\)/);
  assert.match(deleteFn, /eq\(teamFinancialEntryPayments\.accountId, id\)/);
  assert.match(deleteFn, /status: 409/);
  // El chequeo de uso debe ocurrir ANTES del delete real, para no perder integridad referencial.
  const guardIdx = deleteFn.indexOf('status: 409');
  const deleteCallIdx = deleteFn.indexOf('db.delete(teamFinancialAccounts)');
  assert.ok(guardIdx > 0 && deleteCallIdx > guardIdx, 'el guard de 409 debe ejecutarse antes del delete');
});

test('DELETE de centro de costo bloquea con 409 si tiene entries vinculadas', async () => {
  const byId = await read('app/api/plugins/finance/cost-centers/[id]/route.ts');
  const deleteFnStart = byId.indexOf('export async function DELETE');
  const deleteFn = byId.slice(deleteFnStart);
  assert.match(deleteFn, /eq\(teamFinancialEntries\.costCenterId, id\)/);
  assert.match(deleteFn, /status: 409/);
});

test('registrar un pago parcial queda acotado al team y marca la entry como paid al cubrir el monto', async () => {
  const payments = await read('app/api/plugins/finance/entries/[id]/payments/route.ts');
  assert.match(payments, /getFinanceRequestContext\('write'\)/);
  assert.match(payments, /eq\(teamFinancialEntries\.teamId, ctx\.team\.id\)/);
  assert.match(payments, /eq\(teamFinancialEntryPayments\.teamId, ctx\.team\.id\)/);
  // La suma de pagos y el chequeo de status deben vivir dentro de una transacción.
  const txStart = payments.indexOf('db.transaction(async (tx)');
  assert.ok(txStart >= 0, 'el alta de pago debe ocurrir en una transacción');
  const tx = payments.slice(txStart);
  assert.match(tx, /coalesce\(sum\(\$\{teamFinancialEntryPayments\.amount\}\), 0\)/);
  assert.match(tx, /Number\(total\) >= entry\.amount && entry\.status !== 'paid'/);
  assert.match(tx, /status: 'paid'/);
});

test('el overview de finanzas agrega tesorería (saldo por cuenta, cobrar, pagar, gasto por centro de costo)', async () => {
  const overview = await read('app/api/plugins/finance/overview/route.ts');
  assert.match(overview, /getFinanceRequestContext\('read'\)/);
  assert.match(overview, /treasury:/);
  assert.match(overview, /accountBalances/);
  assert.match(overview, /receivablesByCurrency/);
  assert.match(overview, /payablesByCurrency/);
  assert.match(overview, /expenseByCostCenter/);
  // El saldo de cuenta se calcula sobre entries pagadas, nunca sobre pendientes (evita contar dinero que no llegó).
  const accountBalancesStart = overview.indexOf('const accountBalances');
  assert.ok(accountBalancesStart >= 0);
  assert.match(overview.slice(accountBalancesStart, accountBalancesStart + 400), /e\.status === 'paid'/);
});

test('la proyección de flujo de caja está acotada por team y por moneda, y usa fecha efectiva (dueOn u occurredOn)', async () => {
  const cashflow = await read('app/api/plugins/finance/cashflow/route.ts');
  assert.match(cashflow, /getFinanceRequestContext\('read'\)/);
  assert.match(cashflow, /eq\(teamFinancialAccounts\.teamId, ctx\.team\.id\)/);
  assert.match(cashflow, /eq\(teamFinancialEntries\.teamId, ctx\.team\.id\)/);
  assert.match(cashflow, /coalesce\(\$\{teamFinancialEntries\.dueOn\}, \$\{teamFinancialEntries\.occurredOn\}\)/);
  // Regresión del bug conocido del proyecto: date_trunc con parámetro bindeado rompe el GROUP BY.
  assert.doesNotMatch(cashflow, /date_trunc\(\s*\$\{/, 'no debe usar date_trunc con un parámetro bindeado (bug conocido)');
});

test('financialEntrySchema y resolveFinancialRelations validan sale/project/account/cost center dentro del team', async () => {
  const schema = await read('lib/plugins/finance/server/schema.ts');
  assert.match(schema, /saleId: optionalPositiveId/);
  assert.match(schema, /projectId: optionalPositiveId/);
  assert.match(schema, /accountId: optionalPositiveId/);
  assert.match(schema, /costCenterId: optionalPositiveId/);
  assert.match(schema, /eq\(teamSales\.id, saleId\), eq\(teamSales\.teamId, teamId\)/);
  assert.match(schema, /eq\(teamTaskProjects\.id, projectId\), eq\(teamTaskProjects\.teamId, teamId\)/);
  assert.match(schema, /eq\(teamFinancialAccounts\.id, accountId\), eq\(teamFinancialAccounts\.teamId, teamId\)/);
  assert.match(schema, /eq\(teamCostCenters\.id, costCenterId\), eq\(teamCostCenters\.teamId, teamId\)/);
  assert.match(schema, /throw new Error\('invalid_sale'\)/);
  assert.match(schema, /throw new Error\('invalid_project'\)/);
  assert.match(schema, /throw new Error\('invalid_account'\)/);
  assert.match(schema, /throw new Error\('invalid_cost_center'\)/);
});
