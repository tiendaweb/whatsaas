import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getResellerBranding, requireReseller } from '@/lib/db/queries/resellers';
import { ResellerBrandingForm } from './ResellerBrandingForm';

export default async function ResellerBrandingPage() {
  const ctx = await requireReseller();
  if (!ctx) return null;

  const branding = await getResellerBranding(ctx.reseller.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Marca</h1>
        <p className="text-muted-foreground">
          Esto es lo que verán tus clientes en la landing, el panel y los correos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
          <CardDescription>
            El nombre reemplaza a la marca de la plataforma en todas las pantallas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResellerBrandingForm
            branding={branding ?? null}
            fallbackName={ctx.reseller.companyName}
          />
        </CardContent>
      </Card>
    </div>
  );
}
