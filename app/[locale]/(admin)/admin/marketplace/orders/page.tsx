import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getMarketplaceOrders } from '@/lib/plugins/marketplace/server/queries';
import { adminUpdateOrderAction } from '../actions';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
};

export default async function AdminMarketplaceOrdersPage() {
  const orders = await getMarketplaceOrders();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pedidos de Mejoras</h1>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay pedidos aún
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map(({ order, item, team, requestedByUser }) => (
            <Card key={order.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[order.status] ?? ''}`}
                  >
                    {statusLabels[order.status] ?? order.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Equipo</p>
                    <p className="font-medium">{team.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Solicitado por</p>
                    <p className="font-medium">{requestedByUser.name ?? requestedByUser.email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Tipo</p>
                    <p className="font-medium capitalize">{order.pricingType}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Monto</p>
                    <p className="font-medium">{order.amount ? `$${order.amount}` : 'N/A'}</p>
                  </div>
                </div>

                {order.notes && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs">Notas del equipo</p>
                    <p className="mt-0.5">{order.notes}</p>
                  </div>
                )}

                {order.adminNotes && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs">Notas del admin</p>
                    <p className="mt-0.5">{order.adminNotes}</p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Creado: {new Date(order.createdAt).toLocaleString('es')}
                  {order.reviewedAt && ` | Revisado: ${new Date(order.reviewedAt).toLocaleString('es')}`}
                </p>

                {order.status === 'pending' && (
                  <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
                    <form action={adminUpdateOrderAction} className="flex-1 space-y-2">
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="status" value="approved" />
                      <Label htmlFor={`notes-approve-${order.id}`} className="text-xs">
                        Notas (opcional)
                      </Label>
                      <Textarea
                        id={`notes-approve-${order.id}`}
                        name="adminNotes"
                        className="min-h-16"
                        placeholder="Notas para el equipo..."
                      />
                      <Button type="submit" size="sm" className="w-full">
                        Aprobar
                      </Button>
                    </form>
                    <form action={adminUpdateOrderAction} className="flex-1 space-y-2">
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <Label htmlFor={`notes-reject-${order.id}`} className="text-xs">
                        Motivo de rechazo
                      </Label>
                      <Textarea
                        id={`notes-reject-${order.id}`}
                        name="adminNotes"
                        className="min-h-16"
                        placeholder="Motivo del rechazo..."
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="destructive"
                        className="w-full"
                      >
                        Rechazar
                      </Button>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
