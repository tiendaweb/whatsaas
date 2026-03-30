import { NextRequest, NextResponse } from 'next/server';
import { getActivePaymentProvider } from './provider-settings';
import { getPluginById } from './plugins';
import { PaymentPlugin, WebhookHandlerResult } from './plugins/types';

export async function resolveActivePaymentPlugin(): Promise<PaymentPlugin> {
  const activeProvider = await getActivePaymentProvider();
  return getPluginById(activeProvider);
}

export async function validateActivePaymentPluginConfig(): Promise<void> {
  const plugin = await resolveActivePaymentPlugin();
  await plugin.validateConfig();
}

export async function getActivePaymentPluginPublicConfig(): Promise<Record<string, unknown>> {
  const plugin = await resolveActivePaymentPlugin();
  if (!plugin.getPublicConfig) {
    return { provider: plugin.id };
  }

  return await plugin.getPublicConfig();
}

export async function handlePaymentWebhook(request: NextRequest): Promise<NextResponse<WebhookHandlerResult>> {
  const plugin = await resolveActivePaymentPlugin();

  try {
    await plugin.validateConfig();
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

  return plugin.handleWebhook(request);
}
