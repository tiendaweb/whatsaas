import { Globe, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getResellerDomains, requireReseller } from '@/lib/db/queries/resellers';
import { addResellerDomain, setPrimaryDomain } from '../reseller-actions';
import { ActionForm } from '@/components/resellers/action-form';

export default async function ResellerDomainPage() {
  const ctx = await requireReseller();
  if (!ctx) return null;

  const domains = await getResellerDomains(ctx.reseller.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dominio</h1>
        <p className="text-muted-foreground">
          Conecta tu propio dominio para que tus clientes nunca vean otra marca.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agregar dominio</CardTitle>
          <CardDescription>
            Primero apunta el DNS, luego agrégalo aquí. Un administrador lo activará.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={addResellerDomain} className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="hostname" className="sr-only">
                Dominio
              </Label>
              <Input
                id="hostname"
                name="hostname"
                placeholder="chatpro.uno"
                required
              />
            </div>
            <Button type="submit">Agregar</Button>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tus dominios</CardTitle>
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no agregaste ningún dominio.
            </p>
          ) : (
            <ul className="divide-y">
              {domains.map((domain) => (
                <li key={domain.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{domain.hostname}</span>
                    {domain.isPrimary ? <Badge variant="secondary">Principal</Badge> : null}
                    {domain.status === 'active' ? (
                      <Badge className="gap-1 bg-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-amber-600">
                        <Clock className="h-3 w-3" /> Pendiente
                      </Badge>
                    )}
                  </div>

                  {!domain.isPrimary ? (
                    <ActionForm action={setPrimaryDomain}>
                      <input type="hidden" name="domainId" value={domain.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Hacer principal
                      </Button>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuración del DNS</CardTitle>
          <CardDescription>
            Apunta tu dominio a la IP del servidor. Sin esto, el dominio no cargará.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border bg-muted/40 p-4">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-6">Tipo</th>
                  <th className="pb-2 pr-6">Nombre</th>
                  <th className="pb-2">Valor</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr>
                  <td className="pr-6">A</td>
                  <td className="pr-6">@</td>
                  <td>La IP del servidor</td>
                </tr>
                <tr>
                  <td className="pr-6">A</td>
                  <td className="pr-6">www</td>
                  <td>La IP del servidor</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            El certificado HTTPS se emite automáticamente cuando el administrador
            activa el dominio.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
