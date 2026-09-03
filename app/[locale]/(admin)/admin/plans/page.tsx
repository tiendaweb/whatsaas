import { getAllPlans } from '@/lib/db/admin-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Check, X, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { DeletePlanButton } from './delete-plan-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function BooleanIcon({ value }: { value: boolean }) {
  return value ? <Check className="h-4 w-4 text-green-500" /> : <X className="h-4 w-4 text-muted-foreground" />;
}

function formatCurrency(amount: number, currency: string) {
  if (amount === 0) return 'Gratis';
  return new Intl.NumberFormat('es', {
    style: 'currency',
    currency: (currency || 'USD').toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

function intervalLabel(interval: string) {
  if (interval === 'month') return 'Mensual';
  if (interval === 'year') return 'Anual';
  return interval;
}

export default async function AdminPlansPage() {
  const plans = await getAllPlans();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Planes y funciones</h1>
        <Link href="/admin/plans/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Crear plan
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planes disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Facturación</TableHead>
                <TableHead>Prueba</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Instancias</TableHead>
                <TableHead>AI</TableHead>
                <TableHead>Flujos</TableHead>
                <TableHead>Visibilidad</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">
                    {plan.name}
                    <div className="text-xs text-muted-foreground">{plan.stripeProductId || 'Personalizado'}</div>
                  </TableCell>
                  <TableCell>{formatCurrency(plan.amount, plan.currency)}</TableCell>
                  <TableCell>{intervalLabel(plan.interval)}</TableCell>
                  <TableCell>
                    {plan.trialDays > 0 ? (
                      <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {plan.trialDays} días gratis
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin prueba</span>
                    )}
                  </TableCell>
                  <TableCell>{plan.maxUsers}</TableCell>
                  <TableCell>{plan.maxInstances}</TableCell>
                  <TableCell><BooleanIcon value={plan.isAiEnabled} /></TableCell>
                  <TableCell><BooleanIcon value={plan.isFlowBuilderEnabled} /></TableCell>
                  <TableCell>
                    {plan.isHidden ? (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <EyeOff className="h-4 w-4" />
                        <span className="text-xs">Oculto</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-green-600">
                        <Eye className="h-4 w-4" />
                        <span className="text-xs">Visible</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right flex justify-end gap-2">
                    <Link href={`/admin/plans/${plan.id}`}>
                      <Button variant="ghost" size="icon">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <DeletePlanButton id={plan.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
