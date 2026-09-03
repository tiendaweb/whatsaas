import type { CanonicalPaymentStatus } from '@/lib/payments/plugin-types';

export function normalizeManualPaymentStatus(providerStatus: string): CanonicalPaymentStatus {
  const normalized = providerStatus.toLowerCase();
  if (normalized === 'approved' || normalized === 'paid') return 'paid';
  if (normalized === 'pending_manual_review') return 'pending_manual_review';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'canceled') return 'canceled';
  if (normalized === 'pending') return 'pending';
  return 'failed';
}

export function normalizeMercadoPagoStatus(providerStatus: string): CanonicalPaymentStatus {
  const normalized = providerStatus.toLowerCase();
  if (['approved', 'accredited', 'paid', 'authorized'].includes(normalized)) return 'paid';
  if (['in_process', 'pending', 'waiting_for_gateway'].includes(normalized)) return 'pending';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'canceled';
  if (['rejected', 'refunded', 'charged_back', 'paused'].includes(normalized)) return 'rejected';
  return 'failed';
}

export function normalizeStripeStatus(providerStatus: string): CanonicalPaymentStatus {
  const normalized = providerStatus.toLowerCase();
  if (['active', 'trialing', 'paid'].includes(normalized)) return 'paid';
  if (['incomplete', 'past_due', 'pending'].includes(normalized)) return 'pending';
  if (normalized === 'canceled') return 'canceled';
  return 'failed';
}

export function normalizeLemonSqueezyStatus(providerStatus: string): CanonicalPaymentStatus {
  const normalized = providerStatus.toLowerCase();
  if (['paid', 'active', 'on_trial'].includes(normalized)) return 'paid';
  if (['pending', 'past_due'].includes(normalized)) return 'pending';
  if (['cancelled', 'canceled'].includes(normalized)) return 'canceled';
  if (['failed', 'unpaid', 'refunded', 'partial_refund', 'paused'].includes(normalized)) return 'rejected';
  return 'failed';
}
