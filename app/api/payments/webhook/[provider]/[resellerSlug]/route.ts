import { NextRequest, NextResponse } from 'next/server';
import { handlePaymentWebhook } from '@/lib/payments/plugin-runtime';
import type { PaymentProviderId } from '@/lib/payments/provider-settings';

const PROVIDERS = new Set<PaymentProviderId>(['stripe', 'manual', 'mercadopago', 'lemonsqueezy']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string; resellerSlug: string }> },
) {
  const { provider, resellerSlug } = await params;
  if (!PROVIDERS.has(provider as PaymentProviderId) || provider === 'manual') {
    return NextResponse.json({ received: false, message: 'Unsupported provider.' }, { status: 404 });
  }

  return handlePaymentWebhook(request, {
    provider: provider as PaymentProviderId,
    resellerSlug,
  });
}
