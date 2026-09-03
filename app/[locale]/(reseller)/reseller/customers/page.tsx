import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getResellerCustomers, requireReseller } from '@/lib/db/queries/resellers';
import { formatMoney } from '@/lib/resellers/pricing';

export default async function ResellerCustomersPage() {
  const ctx = await requireReseller();
  if (!ctx) return null;

  const customers = await getResellerCustomers(ctx.reseller.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Clientes</h1>
        <p className="text-muted-foreground">
          Los equipos que se registraron a través de tu marca.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{customers.length} cliente(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no tienes clientes. Comparte tu dominio para empezar a captarlos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-6 font-medium">Equipo</th>
                    <th className="pb-2 pr-6 font-medium">Plan</th>
                    <th className="pb-2 pr-6 font-medium">Estado</th>
                    <th className="pb-2 font-medium">Alta</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {customers.map(({ team, planName, planAmount }) => (
                    <tr key={team.id}>
                      <td className="py-3 pr-6 font-medium">{team.name}</td>
                      <td className="py-3 pr-6">
                        {planName ? (
                          <span>
                            {planName}
                            {planAmount != null ? (
                              <span className="ml-2 text-muted-foreground">
                                {formatMoney(planAmount)}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Sin plan</span>
                        )}
                      </td>
                      <td className="py-3 pr-6">
                        {team.subscriptionStatus === 'active' ? (
                          <Badge className="bg-emerald-600">Activo</Badge>
                        ) : (
                          <Badge variant="outline">
                            {team.subscriptionStatus ?? 'Sin suscripción'}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(team.createdAt).toLocaleDateString('es-ES')}
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
