import { and, eq, not } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { plans, resellerPlanPrices } from '@/lib/db/schema';
import { requireReseller } from '@/lib/db/queries/resellers';
import { formatMoney, resolveWholesaleAmount } from '@/lib/resellers/pricing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ActionForm } from '@/components/resellers/action-form';
import { saveResellerPlanPrice } from '../reseller-actions';

export default async function ResellerPlansPage() {
  const ctx = await requireReseller();
  if (!ctx) return null;

  const { reseller } = ctx;

  const [availablePlans, prices] = await Promise.all([
    db.select().from(plans).where(not(plans.isHidden)).orderBy(plans.amount),
    db
      .select()
      .from(resellerPlanPrices)
      .where(eq(resellerPlanPrices.resellerId, reseller.id)),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Planes y precios</h1>
        <p className="text-muted-foreground">
          Tú fijas el precio de venta. La diferencia con el precio mayorista es tu
          ganancia.
        </p>
      </div>

      <div className="grid gap-4">
        {availablePlans.map((plan) => {
          const price = prices.find((p) => p.planId === plan.id);
          const wholesale = resolveWholesaleAmount(reseller, plan, price);
          const retail = price?.retailAmount ?? plan.amount;
          const margin = retail - wholesale;

          return (
            <Card key={plan.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {plan.name}
                      {price?.isPublished === false ? (
                        <Badge variant="outline">Oculto</Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription>
                      Precio de referencia: {formatMoney(plan.amount, plan.currency)} ·{' '}
                      {plan.interval === 'year' ? 'anual' : 'mensual'}
                    </CardDescription>
                  </div>

                  <div className="flex gap-6 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">Te cuesta</p>
                      <p className="text-lg font-semibold">
                        {formatMoney(wholesale, plan.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Tu ganancia</p>
                      <p
                        className={
                          margin < 0
                            ? 'text-lg font-semibold text-destructive'
                            : 'text-lg font-semibold text-emerald-600'
                        }
                      >
                        {formatMoney(margin, plan.currency)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <ActionForm
                  action={saveResellerPlanPrice}
                  className="flex flex-wrap items-end gap-3"
                  successMessage="Precio actualizado."
                >
                  <input type="hidden" name="planId" value={plan.id} />

                  <div className="space-y-2">
                    <Label htmlFor={`retail-${plan.id}`}>Tu precio de venta</Label>
                    <Input
                      id={`retail-${plan.id}`}
                      name="retailAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={(retail / 100).toFixed(2)}
                      className="w-40"
                    />
                  </div>

                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      name="isPublished"
                      defaultChecked={price?.isPublished ?? true}
                      className="h-4 w-4"
                    />
                    Mostrar en mi web
                  </label>

                  <Button type="submit" size="sm">
                    Guardar
                  </Button>

                  {margin < 0 ? (
                    <p className="w-full text-sm text-destructive">
                      Estás vendiendo por debajo de lo que te cuesta: cada venta te
                      resta saldo.
                    </p>
                  ) : null}
                </ActionForm>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
