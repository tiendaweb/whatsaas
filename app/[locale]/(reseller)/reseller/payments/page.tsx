import { and, desc, eq } from 'drizzle-orm';
import { AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { manualPayments, paymentProviderSettings, plans, teams } from '@/lib/db/schema';
import { requireReseller } from '@/lib/db/queries/resellers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { ActionForm } from '@/components/resellers/action-form';
import {
  approveResellerManualPayment,
  rejectResellerManualPayment,
  saveResellerPaymentConfig,
} from '../reseller-actions';

export default async function ResellerPaymentsPage() {
  const ctx = await requireReseller();
  if (!ctx) return null;

  const [settings, pendingManualPayments] = await Promise.all([
    db.select().from(paymentProviderSettings)
      .where(eq(paymentProviderSettings.resellerId, ctx.reseller.id)),
    db.select({ payment: manualPayments, teamName: teams.name, planName: plans.name })
      .from(manualPayments)
      .innerJoin(teams, eq(teams.id, manualPayments.teamId))
      .innerJoin(plans, eq(plans.id, manualPayments.planId))
      .where(and(
        eq(manualPayments.resellerId, ctx.reseller.id),
        eq(manualPayments.status, 'pending_manual_review'),
      ))
      .orderBy(desc(manualPayments.createdAt)),
  ]);

  const stripe = settings.find((s) => s.provider === 'stripe');
  const mercadopago = settings.find((s) => s.provider === 'mercadopago');
  const manual = settings.find((s) => s.provider === 'manual');
  const lemonsqueezy = settings.find((s) => s.provider === 'lemonsqueezy');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Datos de pago</h1>
        <p className="text-muted-foreground">
          Tus clientes te pagan directamente a ti con estas credenciales. El dinero no
          pasa por la plataforma.
        </p>
      </div>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="flex items-start gap-3 pt-6 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Cómo se reparte el dinero</p>
            <p className="text-muted-foreground">
              El importe que le cobras a tu cliente llega íntegro a tu cuenta. Por
              separado, la plataforma te descuenta el precio mayorista del saldo de tu
              billetera. Tu ganancia es la diferencia.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos manuales por revisar</CardTitle>
          <CardDescription>
            Solo puedes procesar pagos de clientes vinculados a tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingManualPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay comprobantes pendientes.</p>
          ) : (
            <div className="space-y-3">
              {pendingManualPayments.map(({ payment, teamName, planName }) => (
                <div key={payment.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">{teamName} · {planName}</p>
                    <p className="text-sm text-muted-foreground">
                      {(payment.amount / 100).toFixed(2)} {payment.currency.toUpperCase()}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {payment.proofUrl ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/api/payments/manual/${payment.id}/proof`} target="_blank">
                          Ver comprobante
                        </Link>
                      </Button>
                    ) : null}
                    <ActionForm action={approveResellerManualPayment} successMessage="Pago aprobado.">
                      <input type="hidden" name="paymentId" value={payment.id} />
                      <Button type="submit" size="sm" disabled={!payment.proofUrl}>Aprobar</Button>
                    </ActionForm>
                    <ActionForm action={rejectResellerManualPayment} successMessage="Pago rechazado.">
                      <input type="hidden" name="paymentId" value={payment.id} />
                      <Button type="submit" size="sm" variant="destructive">Rechazar</Button>
                    </ActionForm>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stripe</CardTitle>
          <CardDescription>
            Necesitas tus claves de Stripe. Sin ellas no podrás cobrar con tarjeta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveResellerPaymentConfig} className="space-y-4">
            <input type="hidden" name="provider" value="stripe" />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="secretKey">Secret key</Label>
                <Input
                  id="secretKey"
                  name="secretKey"
                  type="password"
                  placeholder={stripe?.config?.secretKey ? 'Configurada; deja vacío para conservarla' : 'sk_live_...'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publishableKey">Publishable key</Label>
                <Input
                  id="publishableKey"
                  name="publishableKey"
                  placeholder="pk_live_..."
                  defaultValue={stripe?.config?.publishableKey ?? ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="webhookSecret">Webhook secret</Label>
                <Input
                  id="webhookSecret"
                  name="webhookSecret"
                  type="password"
                  placeholder={stripe?.config?.webhookSecret ? 'Configurado; deja vacío para conservarlo' : 'whsec_...'}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={stripe?.enabled ?? false}
                  className="h-4 w-4"
                />
                Habilitado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isDefault"
                  defaultChecked={stripe?.isDefault ?? false}
                  className="h-4 w-4"
                />
                Usar por defecto
              </label>
              <Button type="submit" size="sm">
                Guardar Stripe
              </Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MercadoPago</CardTitle>
          <CardDescription>Para cobrar en Latinoamérica.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveResellerPaymentConfig} className="space-y-4">
            <input type="hidden" name="provider" value="mercadopago" />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="accessToken">Access token</Label>
                <Input
                  id="accessToken"
                  name="accessToken"
                  type="password"
                  placeholder={mercadopago?.config?.accessToken ? 'Configurado; deja vacío para conservarlo' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publicKey">Public key</Label>
                <Input
                  id="publicKey"
                  name="publicKey"
                  defaultValue={mercadopago?.config?.publicKey ?? ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mpWebhookSecret">Webhook secret</Label>
                <Input
                  id="mpWebhookSecret"
                  name="webhookSecret"
                  type="password"
                  placeholder={mercadopago?.config?.webhookSecret ? 'Configurado; deja vacío para conservarlo' : ''}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={mercadopago?.enabled ?? false}
                  className="h-4 w-4"
                />
                Habilitado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isDefault"
                  defaultChecked={mercadopago?.isDefault ?? false}
                  className="h-4 w-4"
                />
                Usar por defecto
              </label>
              <Button type="submit" size="sm">
                Guardar MercadoPago
              </Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lemon Squeezy</CardTitle>
          <CardDescription>Cobra suscripciones internacionales con tarjeta.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveResellerPaymentConfig} className="space-y-4">
            <input type="hidden" name="provider" value="lemonsqueezy" />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="apiKey">API key</Label>
                <Input
                  id="apiKey"
                  name="apiKey"
                  type="password"
                  placeholder={lemonsqueezy?.config?.apiKey ? 'Configurada; deja vacío para conservarla' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="storeId">Store ID</Label>
                <Input
                  id="storeId"
                  name="storeId"
                  defaultValue={lemonsqueezy?.config?.storeId ?? ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lsWebhookSecret">Webhook secret</Label>
                <Input
                  id="lsWebhookSecret"
                  name="webhookSecret"
                  type="password"
                  placeholder={lemonsqueezy?.config?.webhookSecret ? 'Configurado; deja vacío para conservarlo' : ''}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={lemonsqueezy?.enabled ?? false}
                  className="h-4 w-4"
                />
                Habilitado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isDefault"
                  defaultChecked={lemonsqueezy?.isDefault ?? false}
                  className="h-4 w-4"
                />
                Usar por defecto
              </label>
              <Button type="submit" size="sm">
                Guardar Lemon Squeezy
              </Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transferencia manual</CardTitle>
          <CardDescription>
            El cliente sube un comprobante y tú lo apruebas. No requiere credenciales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveResellerPaymentConfig} className="flex items-center gap-6">
            <input type="hidden" name="provider" value="manual" />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={manual?.enabled ?? false}
                className="h-4 w-4"
              />
              Habilitado
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isDefault"
                defaultChecked={manual?.isDefault ?? false}
                className="h-4 w-4"
              />
              Usar por defecto
            </label>
            <Button type="submit" size="sm">
              Guardar
            </Button>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
