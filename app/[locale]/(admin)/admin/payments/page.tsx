import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { approveManualPayment, getPaymentAdminData, rejectManualPayment, saveProviderConfig } from './actions';
import { Badge } from '@/components/ui/badge';

export default async function AdminPaymentsPage() {
  const { providers, pendingManualPayments } = await getPaymentAdminData();

  const stripe = providers.find((p) => p.provider === 'stripe');
  const manual = providers.find((p) => p.provider === 'manual');
  const mp = providers.find((p) => p.provider === 'mercadopago');

  const mpConfig = (mp?.config ?? {}) as Record<string, string>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Payment Plugins</h1>
        <p className="text-muted-foreground">Configura proveedores desde admin sin tocar el core.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stripe</CardTitle>
          <CardDescription>Proveedor actual, mantenido por compatibilidad.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProviderConfig} className="space-y-4">
            <input type="hidden" name="provider" value="stripe" />
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={Boolean(stripe?.enabled)} />
                Habilitado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isDefault" defaultChecked={Boolean(stripe?.isDefault)} />
                Predeterminado
              </label>
            </div>
            <Button type="submit">Guardar Stripe</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Payment Plugin</CardTitle>
          <CardDescription>Permite pagos manuales con revisión del administrador.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProviderConfig} className="space-y-4">
            <input type="hidden" name="provider" value="manual" />
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={Boolean(manual?.enabled)} />
                Habilitado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isDefault" defaultChecked={Boolean(manual?.isDefault)} />
                Predeterminado
              </label>
            </div>
            <Button type="submit">Guardar Manual Payment</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mercado Pago Plugin</CardTitle>
          <CardDescription>Configura keys y URLs del checkout.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProviderConfig} className="space-y-4">
            <input type="hidden" name="provider" value="mercadopago" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Access Token</Label>
                <Input name="accessToken" defaultValue={mpConfig.accessToken || ''} />
              </div>
              <div className="space-y-2">
                <Label>Public Key</Label>
                <Input name="publicKey" defaultValue={mpConfig.publicKey || ''} />
              </div>
              <div className="space-y-2">
                <Label>Webhook Secret</Label>
                <Input name="webhookSecret" defaultValue={mpConfig.webhookSecret || ''} />
              </div>
              <div className="space-y-2">
                <Label>Success URL</Label>
                <Input name="successUrl" defaultValue={mpConfig.successUrl || ''} />
              </div>
              <div className="space-y-2">
                <Label>Failure URL</Label>
                <Input name="failureUrl" defaultValue={mpConfig.failureUrl || ''} />
              </div>
              <div className="space-y-2">
                <Label>Pending URL</Label>
                <Input name="pendingUrl" defaultValue={mpConfig.pendingUrl || ''} />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={Boolean(mp?.enabled)} />
                Habilitado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isDefault" defaultChecked={Boolean(mp?.isDefault)} />
                Predeterminado
              </label>
            </div>
            <Button type="submit">Guardar Mercado Pago</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos manuales pendientes</CardTitle>
          <CardDescription>Aprueba o rechaza solicitudes creadas por el plugin manual.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pendingManualPayments.length === 0 && <p className="text-sm text-muted-foreground">No hay pagos pendientes.</p>}
            {pendingManualPayments.map(({ payment, team, plan }) => (
              <div key={payment.id} className="rounded-md border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">{team.name} → {plan.name}</p>
                  <p className="text-xs text-muted-foreground">#{payment.id} · {payment.currency.toUpperCase()} {(payment.amount / 100).toFixed(2)}</p>
                  <Badge variant="secondary">{payment.status}</Badge>
                </div>
                <div className="flex gap-2">
                  <form action={approveManualPayment}>
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <Button type="submit">Aprobar</Button>
                  </form>
                  <form action={rejectManualPayment}>
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <Button type="submit" variant="outline">Rechazar</Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
