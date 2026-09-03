import { and, eq } from 'drizzle-orm';
import { ShieldAlert } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { landingPages } from '@/lib/db/schema';
import { requireReseller } from '@/lib/db/queries/resellers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ActionForm } from '@/components/resellers/action-form';
import { saveResellerLanding } from '../reseller-actions';

export default async function ResellerLandingPage() {
  const ctx = await requireReseller();
  if (!ctx) return null;

  // La landing raíz del reseller es la que tiene slug vacío en su dominio.
  const page = await db.query.landingPages.findFirst({
    where: and(
      eq(landingPages.resellerId, ctx.reseller.id),
      eq(landingPages.slug, ''),
    ),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Landing</h1>
        <p className="text-muted-foreground">
          Pega tu propio HTML. Se publicará en la portada de tu dominio.
        </p>
      </div>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="flex items-start gap-3 pt-6 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Sobre el HTML permitido</p>
            <p className="text-muted-foreground">
              Se admite maquetación, estilos, imágenes y vídeos embebidos. Las
              etiquetas <code>&lt;script&gt;</code> se eliminan por seguridad: tu
              landing comparte dominio con la pantalla de acceso de tus clientes, y un
              script podría capturar sus contraseñas.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tu portada</CardTitle>
          <CardDescription>
            Si la dejas vacía, se mostrará la portada por defecto con tu marca.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={saveResellerLanding}
            className="space-y-4"
            successMessage="Landing publicada."
          >
            <div className="space-y-2">
              <Label htmlFor="content">HTML</Label>
              <textarea
                id="content"
                name="content"
                rows={16}
                spellCheck={false}
                defaultValue={page?.content ?? ''}
                placeholder="<section><h1>Bienvenido a ChatPro</h1></section>"
                className="w-full rounded-md border border-input bg-background p-3 font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customCss">CSS (opcional)</Label>
              <textarea
                id="customCss"
                name="customCss"
                rows={6}
                spellCheck={false}
                defaultValue={page?.customCss ?? ''}
                placeholder=".hero { padding: 4rem 0; }"
                className="w-full rounded-md border border-input bg-background p-3 font-mono text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="hideChrome"
                defaultChecked={page?.hideChrome ?? false}
                className="h-4 w-4"
              />
              Mi HTML ya incluye su propia cabecera (ocultar la cabecera por defecto)
            </label>

            <Button type="submit">Publicar landing</Button>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
