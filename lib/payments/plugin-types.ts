import type { teams } from '@/lib/db/schema';
import type { PaymentProviderId } from '@/lib/payments/provider-settings';
import type { NextRequest, NextResponse } from 'next/server';

export type PaymentTenantContext = {
  resellerId: number | null;
  teamId: number | null;
  baseUrl: string;
  providerConfig: Record<string, string | undefined>;
};

export type CheckoutInput = {
  team: typeof teams.$inferSelect | null;
  priceId: string;
  planId?: number;
  context: PaymentTenantContext;
};

export const CANONICAL_PAYMENT_STATUSES = [
  'pending', 'pending_manual_review', 'paid', 'rejected', 'failed', 'canceled',
] as const;
export type CanonicalPaymentStatus = (typeof CANONICAL_PAYMENT_STATUSES)[number];
export type PaymentStatusActor = 'admin' | 'reseller' | 'webhook' | 'system';
export type PaymentStatusAuditEvent = {
  provider: PaymentProviderId;
  paymentReference: string;
  previousStatus: CanonicalPaymentStatus | null;
  nextStatus: CanonicalPaymentStatus;
  actor: PaymentStatusActor;
  metadata?: Record<string, unknown>;
};
export type PaymentAuditLogger = {
  recordStatusChange(event: PaymentStatusAuditEvent): Promise<void>;
};
export type WebhookHandlerResult = { received: boolean; ignored?: boolean; message?: string };

export type PaymentPlugin = {
  id: PaymentProviderId;
  createCheckout(input: CheckoutInput): Promise<void>;
  createCustomerPortal?(team: typeof teams.$inferSelect, context: PaymentTenantContext): Promise<string | null>;
  cancelSubscription?(team: typeof teams.$inferSelect, context: PaymentTenantContext): Promise<void>;
  validateConfig(context: PaymentTenantContext): Promise<void> | void;
  handleWebhook(
    request: NextRequest,
    context: PaymentTenantContext,
  ): Promise<NextResponse<WebhookHandlerResult>>;
  normalizePaymentStatus(providerStatus: string): CanonicalPaymentStatus;
  getPublicConfig?(context: PaymentTenantContext): Promise<Record<string, unknown>> | Record<string, unknown>;
  audit: PaymentAuditLogger;
};
