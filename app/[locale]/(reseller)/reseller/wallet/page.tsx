import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionForm } from '@/components/resellers/action-form';
import {
  getResellerWallet,
  getWalletTransactions,
  requireReseller,
} from '@/lib/db/queries/resellers';
import { formatMoney } from '@/lib/resellers/pricing';
import { requestTopup } from '../reseller-actions';

const TYPE_LABELS: Record<string, string> = {
  topup: 'Recarga',
  debit_plan: 'Plan activado',
  refund: 'Reembolso',
  adjustment: 'Ajuste',
  chargeback: 'Contracargo',
};

export default async function ResellerWalletPage() {
  const ctx = await requireReseller();
  if (!ctx) return null;

  const [wallet, transactions] = await Promise.all([
    getResellerWallet(ctx.reseller.id),
    getWalletTransactions(ctx.reseller.id),
  ]);

  const balance = wallet?.balance ?? 0;
  const currency = wallet?.currency ?? ctx.reseller.currency;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Billetera</h1>
        <p className="text-muted-foreground">
          De aquí se descuenta el precio mayorista cada vez que un cliente tuyo activa
          un plan.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Saldo disponible</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={
                balance <= 0 ? 'text-4xl font-bold text-destructive' : 'text-4xl font-bold'
              }
            >
              {formatMoney(balance, currency)}
            </p>
            {balance < 0 ? (
              <p className="mt-2 text-sm text-destructive">
                Tienes saldo negativo. Regulariza para volver a activar clientes.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recargar saldo</CardTitle>
            <CardDescription>
              Solicita una recarga y adjunta el comprobante. Un administrador la
              acreditará.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={requestTopup}
              className="grid gap-3 md:grid-cols-3 md:items-end"
              successMessage="Recarga solicitada. Queda pendiente de aprobación."
            >
              <div className="space-y-2">
                <Label htmlFor="amount">Importe</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="100.00"
                  required
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="reference">Referencia del pago</Label>
                <Input
                  id="reference"
                  name="reference"
                  placeholder="Nº de transferencia o comprobante"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topup-proof">Comprobante</Label>
                <Input
                  id="topup-proof"
                  name="proof"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                />
              </div>
              <Button type="submit">Solicitar recarga</Button>
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-6 font-medium">Fecha</th>
                    <th className="pb-2 pr-6 font-medium">Concepto</th>
                    <th className="pb-2 pr-6 font-medium">Importe</th>
                    <th className="pb-2 font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-3 pr-6 text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString('es-ES')}
                      </td>
                      <td className="py-3 pr-6">
                        <div className="flex items-center gap-2">
                          <span>{TYPE_LABELS[tx.type] ?? tx.type}</span>
                          {tx.status === 'pending_debt' ? (
                            <Badge variant="destructive">Deuda</Badge>
                          ) : null}
                        </div>
                        {tx.description ? (
                          <p className="text-xs text-muted-foreground">{tx.description}</p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-6">
                        <span
                          className={
                            tx.amount >= 0
                              ? 'flex items-center gap-1 font-medium text-emerald-600'
                              : 'flex items-center gap-1 font-medium text-destructive'
                          }
                        >
                          {tx.amount >= 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {formatMoney(Math.abs(tx.amount), tx.currency)}
                        </span>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {formatMoney(tx.balanceAfter, tx.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
