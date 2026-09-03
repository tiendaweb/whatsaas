import assert from 'node:assert/strict';
import test from 'node:test';
import { isPlatformAdmin, isReseller } from '../../lib/auth/roles';
import { resolveWholesaleAmount } from '../../lib/resellers/pricing';

test('calcula el mayorista sin aceptar descuentos fuera de rango', () => {
  const plan = { amount: 10_000 };
  assert.equal(resolveWholesaleAmount({ wholesaleDiscountBps: 3000 }, plan, null), 7_000);
  assert.equal(resolveWholesaleAmount({ wholesaleDiscountBps: 20_000 }, plan, null), 0);
  assert.equal(resolveWholesaleAmount({ wholesaleDiscountBps: -100 }, plan, null), 10_000);
  assert.equal(resolveWholesaleAmount({ wholesaleDiscountBps: 3000 }, plan, { wholesaleAmount: 6_500 }), 6_500);
});

test('separa roles administrativos y reseller', () => {
  assert.equal(isPlatformAdmin({ role: 'admin' }), true);
  assert.equal(isReseller({ role: 'reseller' }), true);
  assert.equal(isReseller({ role: 'admin' }), false);
});
