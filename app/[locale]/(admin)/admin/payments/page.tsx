import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { approveManualPayment, getPaymentAdminData, rejectManualPayment } from './actions';
import { Badge } from '@/components/ui/badge';
import { ProviderConfigSections } from './provider-config-sections';

export default async function AdminPaymentsPage() {
  const { providers, pendingManualPayments } = await getPaymentAdminData();

  const stripe = providers.find((p) => p.provider === 'stripe');
  const manual = providers.find((p) => p.provider === 'manual');
  const mp = providers.find((p) => p.provider === 'mercadopago');
  const ls = providers.find((p) => p.provider === 'lemonsqueezy');

  const hasProviderRows = providers.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Plugins de pago</h1>
        <p className="text-muted-foreground">Configura proveedores desde admin sin tocar el core.</p>
        {!hasProviderRows && (
          <p className="text-sm text-amber-600 mt-2">
            No se pudieron cargar las tablas de pagos. Ejecuta migraciones de base de datos y recarga esta pantalla.
          </p>
        )}
      </div>

      <ProviderConfigSections stripe={stripe} manual={manual} mp={mp} ls={ls} />

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
