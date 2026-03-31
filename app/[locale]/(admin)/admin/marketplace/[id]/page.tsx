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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="iconUrl">URL de Icono</Label>
                  <Input
                    id="iconUrl"
                    name="iconUrl"
                    placeholder="https://..."
                    defaultValue={item?.iconUrl ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imageUrl">URL de Imagen</Label>
                  <Input
                    id="imageUrl"
                    name="imageUrl"
                    placeholder="https://..."
                    defaultValue={item?.imageUrl ?? ''}
                  />
                </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Categoría</Label>
                  <Input
                    id="category"
                    name="category"
                    defaultValue={item?.category ?? 'general'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tags">Etiquetas (separadas por coma)</Label>
                  <Input
                    id="tags"
                    name="tags"
                    placeholder="popular, premium, gratis"
                    defaultValue={item?.tags?.join(', ') ?? ''}
                  />
                </div>
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
                  <select
                    name="status"
                    defaultValue={item?.status ?? 'active'}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="active">Activo (visible)</option>
                    <option value="draft">Borrador</option>
                  </select>
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
