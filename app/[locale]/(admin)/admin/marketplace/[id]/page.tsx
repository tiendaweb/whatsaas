import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { getMarketplaceItemById } from '@/lib/plugins/marketplace/server/queries';
import {
  adminCreateItemAction,
  adminUpdateItemAction,
  adminImproveItemAction,
} from '../actions';
import { Sparkles } from 'lucide-react';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminMarketplaceItemPage({ params }: PageProps) {
  const { id } = await params;
  const isNew = id === 'new';
  const item = isNew ? null : await getMarketplaceItemById(Number(id));

  if (!isNew && !item) {
    notFound();
  }

  const action = isNew ? adminCreateItemAction : adminUpdateItemAction;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">
        {isNew ? 'Nueva Mejora' : `Editar: ${item!.title}`}
      </h1>

      {/* AI Improve (only for existing) */}
      {!isNew && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Mejorar con IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {['title', 'subtitle', 'description'].map((field) => (
                <form key={field} action={adminImproveItemAction}>
                  <input type="hidden" name="id" value={item!.id} />
                  <input type="hidden" name="field" value={field} />
                  <Button variant="outline" size="sm" type="submit">
                    <Sparkles className="mr-1 h-3 w-3" />
                    Mejorar {field}
                  </Button>
                </form>
              ))}
              <form action={adminImproveItemAction}>
                <input type="hidden" name="id" value={item!.id} />
                <Button variant="outline" size="sm" type="submit">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Mejorar todo
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}

      <form action={action}>
        {!isNew && <input type="hidden" name="id" value={item!.id} />}

        <div className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Información básica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    name="title"
                    required
                    defaultValue={item?.title ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subtitle">Subtítulo</Label>
                  <Input
                    id="subtitle"
                    name="subtitle"
                    defaultValue={item?.subtitle ?? ''}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="iconUrl">URL de Icono/Imagen</Label>
                <Input
                  id="iconUrl"
                  name="iconUrl"
                  placeholder="https://..."
                  defaultValue={item?.iconUrl ?? ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  name="description"
                  className="min-h-32"
                  defaultValue={item?.description ?? ''}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Categoría</Label>
                  <Input
                    id="category"
                    name="category"
                    defaultValue={item?.category ?? 'general'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tag">Etiqueta</Label>
                  <Input
                    id="tag"
                    name="tag"
                    defaultValue={item?.tag ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="order">Orden</Label>
                  <Input
                    id="order"
                    name="order"
                    type="number"
                    defaultValue={item?.order ?? 0}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Precios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  id="isFree"
                  name="isFree"
                  defaultChecked={item?.isFree ?? false}
                />
                <Label htmlFor="isFree">Gratis</Label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="monthlyPrice">Precio Mensual</Label>
                  <Input
                    id="monthlyPrice"
                    name="monthlyPrice"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    defaultValue={item?.monthlyPrice ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="annualPrice">Precio Anual</Label>
                  <Input
                    id="annualPrice"
                    name="annualPrice"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    defaultValue={item?.annualPrice ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="installationPrice">Precio Instalación</Label>
                  <Input
                    id="installationPrice"
                    name="installationPrice"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    defaultValue={item?.installationPrice ?? ''}
                  />
                </div>
              </div>
              <div className="space-y-2 max-w-[120px]">
                <Label htmlFor="currency">Moneda</Label>
                <Input
                  id="currency"
                  name="currency"
                  maxLength={3}
                  defaultValue={item?.currency ?? 'usd'}
                />
              </div>
            </CardContent>
          </Card>

          {/* Interface Blocks (Repeater) */}
          <Card>
            <CardHeader>
              <CardTitle>Bloques de Interfaz (HTML)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                name="interfaceBlocks"
                className="font-mono min-h-28"
                placeholder='[{"html": "<div>...</div>"}]'
                defaultValue={JSON.stringify(item?.interfaceBlocks ?? [], null, 2)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                JSON array de objetos con campo &quot;html&quot;
              </p>
            </CardContent>
          </Card>

          {/* Custom Fields (Repeater) */}
          <Card>
            <CardHeader>
              <CardTitle>Campos Personalizados</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                name="customFields"
                className="font-mono min-h-28"
                placeholder='[{"label": "Nombre", "key": "name", "value": "Valor"}]'
                defaultValue={JSON.stringify(item?.customFields ?? [], null, 2)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                JSON array con label, key y value
              </p>
            </CardContent>
          </Card>

          {/* Status */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    id="isActive"
                    name="isActive"
                    defaultChecked={item?.isActive ?? true}
                  />
                  <Label htmlFor="isActive">Activo (visible en marketplace)</Label>
                </div>
                <Button type="submit" size="lg">
                  {isNew ? 'Crear Mejora' : 'Guardar cambios'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
