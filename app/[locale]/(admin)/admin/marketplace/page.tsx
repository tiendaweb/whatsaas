import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getMarketplaceItems } from '@/lib/plugins/marketplace/server/queries';
import {
  adminDeleteItemAction,
  adminToggleItemAction,
  adminGenerateWithAIAction,
  adminBatchGenerateAction,
} from './actions';
import Link from 'next/link';
import { Plus, Sparkles, Trash2, Pencil, Eye, EyeOff } from 'lucide-react';
import { SeedMarketplaceButton } from './SeedMarketplaceButton';

export default async function AdminMarketplacePage() {
  const items = await getMarketplaceItems({ activeOnly: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Marketplace - Mejoras</h1>
        <div className="flex items-center gap-2">
          <SeedMarketplaceButton />
          <Link href="/admin/marketplace/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Mejora
            </Button>
          </Link>
        </div>
      </div>

      {/* AI Generation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Generar con IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={adminGenerateWithAIAction} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ai-prompt">Describe la mejora</Label>
                <Input
                  id="ai-prompt"
                  name="prompt"
                  placeholder="Ej: Sistema de reservas online para restaurantes"
                />
              </div>
              <Button type="submit" variant="outline" size="sm">
                <Sparkles className="mr-2 h-3 w-3" />
                Generar
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Generación en lote
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={adminBatchGenerateAction} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ai-topics">Temas (uno por línea)</Label>
                <Textarea
                  id="ai-topics"
                  name="topics"
                  placeholder={'Chat en vivo\nSistema de tickets\nAnalytics avanzado'}
                  className="min-h-20"
                />
              </div>
              <Button type="submit" variant="outline" size="sm">
                <Sparkles className="mr-2 h-3 w-3" />
                Generar lote
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>Artículos ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {items.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground text-center">
                No hay artículos en el marketplace
              </p>
            )}
            {items.map((item) => {
              const isActive = item.status === 'active';
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 py-3"
                >
                  {item.iconUrl ? (
                    <img
                      src={item.iconUrl}
                      alt={item.title}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                      {item.title.charAt(0)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">
                        {item.category}
                      </Badge>
                      {item.tags?.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {!isActive && (
                        <Badge variant="destructive" className="text-xs">
                          Borrador
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <form action={adminToggleItemAction}>
                      <input type="hidden" name="id" value={item.id} />
                      <input
                        type="hidden"
                        name="newStatus"
                        value={isActive ? 'draft' : 'active'}
                      />
                      <Button variant="ghost" size="icon" type="submit" title={isActive ? 'Desactivar' : 'Activar'}>
                        {isActive ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </Button>
                    </form>
                    <Link href={`/admin/marketplace/${item.id}`}>
                      <Button variant="ghost" size="icon">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <form action={adminDeleteItemAction}>
                      <input type="hidden" name="id" value={item.id} />
                      <Button
                        variant="ghost"
                        size="icon"
                        type="submit"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
