import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeManualPaymentStatus,
  normalizeMercadoPagoStatus,
  normalizeStripeStatus,
} from '../../lib/payments/statuses';

test('normaliza estados finales y pendientes de cada proveedor', () => {
  assert.equal(normalizeManualPaymentStatus('pending_manual_review'), 'pending_manual_review');
  assert.equal(normalizeManualPaymentStatus('approved'), 'paid');
  assert.equal(normalizeMercadoPagoStatus('accredited'), 'paid');
  assert.equal(normalizeMercadoPagoStatus('charged_back'), 'rejected');
  assert.equal(normalizeStripeStatus('trialing'), 'paid');
  assert.equal(normalizeStripeStatus('past_due'), 'pending');
});

test('un estado desconocido nunca activa un plan', () => {
  assert.equal(normalizeManualPaymentStatus('unknown'), 'failed');
  assert.equal(normalizeMercadoPagoStatus('unknown'), 'failed');
  assert.equal(normalizeStripeStatus('unknown'), 'failed');
});
