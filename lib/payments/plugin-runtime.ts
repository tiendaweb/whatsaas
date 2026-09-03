import { NextRequest, NextResponse } from 'next/server';
import { getActivePaymentProvider } from './provider-settings';
import { getPluginById } from './plugins';
import { PaymentPlugin, WebhookHandlerResult } from './plugins/types';
import { findResellerIdBySlug, resolvePaymentTenantContext } from './context';
import type { PaymentProviderId } from './provider-settings';

export async function resolveActivePaymentPlugin(): Promise<PaymentPlugin> {
  const activeProvider = await getActivePaymentProvider();
  return getPluginById(activeProvider);
}

export async function validateActivePaymentPluginConfig(): Promise<void> {
  const plugin = await resolveActivePaymentPlugin();
  const context = await resolvePaymentTenantContext({ provider: plugin.id });
  await plugin.validateConfig(context);
}

export async function getActivePaymentPluginPublicConfig(): Promise<Record<string, unknown>> {
  const plugin = await resolveActivePaymentPlugin();
  const context = await resolvePaymentTenantContext({ provider: plugin.id });
  if (!plugin.getPublicConfig) {
    return { provider: plugin.id };
  }

  return await plugin.getPublicConfig(context);
}

export async function handlePaymentWebhook(
  request: NextRequest,
  scope?: {
    provider?: PaymentProviderId;
    resellerId?: number | null;
    resellerSlug?: string;
  },
): Promise<NextResponse<WebhookHandlerResult>> {
  const resellerId = scope?.resellerSlug
    ? await findResellerIdBySlug(scope.resellerSlug)
    : scope?.resellerId ?? null;
  if (scope?.resellerSlug && scope.resellerSlug !== 'platform' && resellerId == null) {
    return NextResponse.json({ received: false, message: 'Unknown reseller.' }, { status: 404 });
  }

  const provider = scope?.provider ?? await getActivePaymentProvider(resellerId);
  const plugin = getPluginById(provider);
  const context = await resolvePaymentTenantContext({
    provider,
    resellerId,
    requirePaymentsEnabled: false,
  });

  try {
    await plugin.validateConfig(context);
  } catch (error) {
    console.error({
      scope: 'payments.plugin-runtime',
      action: 'validate_plugin_config',
      message: `Webhook ignored due to invalid ${plugin.id} configuration`,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        received: true,
        ignored: true,
        message: `Webhook ignored due to invalid ${plugin.id} configuration`,
      },
      { status: 200 }
    );
  }

  return plugin.handleWebhook(request, context);
}
