import { teams } from '@/lib/db/schema';
import { NextRequest, NextResponse } from 'next/server';

export type CheckoutInput = {
  team: typeof teams.$inferSelect | null;
  priceId: string;
  planId?: number;
};

export const CANONICAL_PAYMENT_STATUSES = [
  'pending',
  'pending_manual_review',
  'paid',
  'rejected',
  'failed',
  'canceled',
] as const;

export type CanonicalPaymentStatus = (typeof CANONICAL_PAYMENT_STATUSES)[number];

export type PaymentStatusActor = 'admin' | 'webhook' | 'system';

export type PaymentStatusAuditEvent = {
  provider: PaymentPlugin['id'];
  paymentReference: string;
  previousStatus: CanonicalPaymentStatus | null;
  nextStatus: CanonicalPaymentStatus;
  actor: PaymentStatusActor;
  metadata?: Record<string, unknown>;
};

export type PaymentAuditLogger = {
  recordStatusChange(event: PaymentStatusAuditEvent): Promise<void>;
};

export type WebhookHandlerResult = {
  received: boolean;
  ignored?: boolean;
  message?: string;
};

export type PaymentPlugin = {
  id: 'stripe' | 'manual' | 'mercadopago';
  createCheckout(input: CheckoutInput): Promise<void>;
  createCustomerPortal?(team: typeof teams.$inferSelect): Promise<string | null>;
  validateConfig(): Promise<void> | void;
  handleWebhook(request: NextRequest): Promise<NextResponse<WebhookHandlerResult>>;
  normalizePaymentStatus(providerStatus: string): CanonicalPaymentStatus;
  getPublicConfig?(): Promise<Record<string, unknown>> | Record<string, unknown>;
  audit: PaymentAuditLogger;
};
