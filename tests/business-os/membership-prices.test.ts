import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { syncPlanPrices } from '../../lib/plugins/memberships/server/prices';

test('la moneda principal siempre entra en la lista', () => {
  assert.deepEqual(syncPlanPrices({ currency: 'USD', price: 6000 }), [{ currency: 'USD', price: 6000 }]);
  assert.deepEqual(
    syncPlanPrices({ prices: [{ currency: 'ARS', price: 6_000_000 }], currency: 'USD', price: 6000 }),
    [{ currency: 'ARS', price: 6_000_000 }, { currency: 'USD', price: 6000 }],
  );
});

test('editar sólo el precio principal actualiza su fila y no toca las otras monedas', () => {
  const previous = [
    { currency: 'ARS', price: 6_000_000 },
    { currency: 'PYG', price: 450_000_000 },
    { currency: 'USD', price: 6000 },
  ];
  assert.deepEqual(syncPlanPrices({ previous, currency: 'ARS', price: 7_500_000 }), [
    { currency: 'ARS', price: 7_500_000 },
    { currency: 'PYG', price: 450_000_000 },
    { currency: 'USD', price: 6000 },
  ]);
});

test('con lista explícita manda la lista, no el precio principal', () => {
  const prices = [{ currency: 'ARS', price: 9_000_000 }, { currency: 'usd', price: 7000 }];
  assert.deepEqual(syncPlanPrices({ prices, previous: [{ currency: 'PYG', price: 1 }], currency: 'ARS', price: 1 }), [
    { currency: 'ARS', price: 9_000_000 },
    { currency: 'USD', price: 7000 },
  ]);
});

test('las monedas se guardan en mayúsculas', () => {
  assert.deepEqual(syncPlanPrices({ previous: [{ currency: 'pyg', price: 450_000_000 }], currency: 'pyg', price: 500_000_000 }), [
    { currency: 'PYG', price: 500_000_000 },
  ]);
});

test('las empresas declaran sus monedas y la pantalla las ofrece', async () => {
  const [schema, companies, shared] = await Promise.all([
    readFile('lib/db/schema.ts', 'utf8'),
    readFile('lib/plugins/memberships/server/companies.ts', 'utf8'),
    readFile('lib/plugins/memberships/ui/shared.ts', 'utf8'),
  ]);
  assert.match(schema, /currencies: jsonb\("currencies"\)/);
  assert.match(schema, /defaultCurrency: varchar\("default_currency", \{ length: 3 \}\)/);
  // La moneda por defecto no puede quedar fuera de las que vende la empresa.
  assert.match(companies, /function pickDefaultCurrency/);
  assert.match(shared, /export function companyCurrencies/);
  assert.match(shared, /export function planPriceIn/);
});
