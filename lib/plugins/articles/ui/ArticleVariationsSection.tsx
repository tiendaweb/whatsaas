'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Sparkles, Trash2 } from 'lucide-react';

type Attribute = { id: number; name: string; values: string[] };
type Variation = {
  id: number;
  combination: Record<string, string>;
  sku: string | null;
  price: number | null;
  stock: number | null;
  status: 'active' | 'inactive';
};

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export function ArticleVariationsSection({
  articleId,
  attributeIds,
  onAttributeIdsChange,
  basePrice,
}: {
  articleId: number;
  attributeIds: number[];
  onAttributeIdsChange: (ids: number[]) => Promise<void>;
  basePrice: number;
}) {
  const { data: attributes } = useSWR<Attribute[]>('/api/plugins/article-attributes', fetcher);
  const { data: variations, mutate } = useSWR<Variation[]>(
    `/api/plugins/articles/${articleId}/variations`,
    fetcher,
  );
  const [isGenerating, setIsGenerating] = useState(false);

  const attrs = attributes ?? [];
  const selectedAttrs = useMemo(() => attrs.filter(a => attributeIds.includes(a.id)), [attrs, attributeIds]);

  function toggleAttribute(id: number) {
    const next = attributeIds.includes(id) ? attributeIds.filter(a => a !== id) : [...attributeIds, id];
    onAttributeIdsChange(next);
  }

  async function handleGenerate() {
    if (selectedAttrs.length === 0) return;
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/plugins/articles/${articleId}/variations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', attributeIds: selectedAttrs.map(a => a.id) }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      if (created.length === 0) {
        toast.info('No hay combinaciones nuevas para generar');
      } else {
        toast.success(`${created.length} variación(es) generada(s)`);
      }
      mutate();
    } catch {
      toast.error('No se pudieron generar las variaciones');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleUpdate(variation: Variation, patch: Partial<Variation>) {
    const res = await fetch(`/api/plugins/articles/${articleId}/variations/${variation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error('No se pudo actualizar la variación');
      return;
    }
    mutate();
  }

  async function handleDelete(variation: Variation) {
    if (!confirm('¿Eliminar esta variación?')) return;
    const res = await fetch(`/api/plugins/articles/${articleId}/variations/${variation.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('No se pudo eliminar la variación');
      return;
    }
    mutate();
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground mb-2">
          Elige qué atributos reutilizables (Color, Talla, etc.) aplican a este artículo. Es opcional.
        </p>
        {attrs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hay atributos creados todavía. Podés crearlos en{' '}
            <a href="/plugins/articles/attributes" className="underline">Atributos reutilizables</a>.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {attrs.map(attr => (
              <label key={attr.id} className="flex items-center gap-2 text-sm border border-border rounded-md px-2.5 py-1.5 cursor-pointer">
                <Checkbox checked={attributeIds.includes(attr.id)} onCheckedChange={() => toggleAttribute(attr.id)} />
                {attr.name}
                <span className="text-xs text-muted-foreground">({attr.values.length})</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {selectedAttrs.length > 0 && (
        <div className="space-y-3">
          <Button type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating} className="gap-1.5">
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generar variaciones
          </Button>

          {variations && variations.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase">
                <span>Combinación</span>
                <span>SKU</span>
                <span>Precio</span>
                <span>Stock</span>
                <span />
              </div>
              {variations.map(v => (
                <div key={v.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 px-3 py-2 items-center border-b border-border/60 last:border-b-0">
                  <span className="text-sm">
                    {Object.entries(v.combination).map(([k, val]) => `${k}: ${val}`).join(' · ')}
                  </span>
                  <Input
                    defaultValue={v.sku ?? ''}
                    placeholder="—"
                    className="h-8 text-sm"
                    onBlur={e => handleUpdate(v, { sku: e.target.value || null })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={v.price != null ? (v.price / 100).toFixed(2) : ''}
                    placeholder={`${(basePrice / 100).toFixed(2)} (base)`}
                    className="h-8 text-sm"
                    onBlur={e => handleUpdate(v, { price: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                  />
                  <Input
                    type="number"
                    defaultValue={v.stock != null ? String(v.stock) : ''}
                    placeholder="—"
                    className="h-8 text-sm"
                    onBlur={e => handleUpdate(v, { stock: e.target.value ? parseInt(e.target.value, 10) : null })}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(v)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
