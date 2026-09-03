import { handlePaymentWebhook } from '@/lib/payments/plugin-runtime';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  return handlePaymentWebhook(request, { provider: 'mercadopago', resellerId: null });
}
