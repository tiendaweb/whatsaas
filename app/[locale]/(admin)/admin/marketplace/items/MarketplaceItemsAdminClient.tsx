'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Price = {
  id: number;
  itemId: number;
  billingType: 'one_time' | 'free' | 'monthly' | 'yearly' | 'setup';
  amount: number;
  currency: string;
  enabled: boolean;
};

type Item = {
  id: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string;
  status: 'draft' | 'active' | 'archived';
  prices: Price[];
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const validityRules: Record<Price['billingType'], string> = {
  one_time: 'Sin vencimiento automático (acceso permanente).',
  free: 'Acceso gratuito sin fecha de fin.',
  monthly: 'Vigencia de 30 días desde la aprobación.',
  yearly: 'Vigencia de 365 días desde la aprobación.',
  setup: 'Cargo de implementación sin vigencia recurrente.',
};

const billingModes: Price['billingType'][] = ['one_time', 'monthly', 'yearly', 'setup', 'free'];

export function MarketplaceItemsAdminClient() {
  const { data: items, mutate, isLoading } = useSWR<Item[]>('/api/plugins/marketplace/items', fetcher);
  const [creating, setCreating] = useState(false);
  const [loadingSeedApps, setLoadingSeedApps] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('general');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const totals = useMemo(() => ({
    all: items?.length ?? 0,
    active: (items ?? []).filter((item) => item.status === 'active').length,
  }), [items]);

  async function createItem() {
    setCreating(true);
    setStatusMessage(null);

    const response = await fetch('/api/plugins/marketplace/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newItemTitle,
        category: newItemCategory,
        description: newItemDescription || null,
        status: 'draft',
      }),
    });

    if (!response.ok) {
      setStatusMessage('No se pudo crear el item.');
      setCreating(false);
      return;
    }

    setNewItemTitle('');
    setNewItemCategory('general');
    setNewItemDescription('');
    setStatusMessage('Item creado en borrador.');
    setCreating(false);
    await mutate();
  }

  async function loadSeedApps() {
    setLoadingSeedApps(true);
    setStatusMessage(null);

    try {
      const response = await fetch('/api/plugins/marketplace/admin/load-seed-apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        setStatusMessage(`Error: ${error.error || 'No se pudieron cargar las apps de ejemplo'}`);
      } else {
        setStatusMessage('✓ Apps de ejemplo cargadas exitosamente (24 apps + 2 por defecto)');
        await mutate();
      }
    } catch (error) {
      setStatusMessage('Error al cargar las apps de ejemplo');
      console.error('Error:', error);
    } finally {
      setLoadingSeedApps(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Marketplace · Items</h1>
        <div className="flex gap-2">
          <Badge variant="outline">Total: {totals.all}</Badge>
          <Badge>Activos: {totals.active}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cargar Apps de Ejemplo</CardTitle>
          <CardDescription>Carga automáticamente 24 apps de ejemplo en diferentes categorías (Mejoras, Productividad, Automatización, Nodos, Apps, Marketing) + 2 apps por defecto (Notas y Calendario).</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button onClick={loadSeedApps} disabled={loadingSeedApps} variant="default">
            {loadingSeedApps ? 'Cargando...' : 'Cargar Apps de Ejemplo'}
          </Button>
          {statusMessage && <p className="text-xs text-muted-foreground">{statusMessage}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Crear item</CardTitle>
          <CardDescription>Alta rápida de item para luego gestionar precios y vigencia.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={newItemTitle} onChange={(event) => setNewItemTitle(event.target.value)} placeholder="Ej: Inbox pro" />
          </div>
          <div className="space-y-2">
            <Label>Categoría</Label>
            <Input value={newItemCategory} onChange={(event) => setNewItemCategory(event.target.value)} placeholder="general" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Descripción</Label>
            <Textarea value={newItemDescription} onChange={(event) => setNewItemDescription(event.target.value)} rows={3} />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <Button disabled={creating || !newItemTitle.trim()} onClick={createItem}>
              {creating ? 'Creando...' : 'Crear item'}
            </Button>
            {statusMessage ? <p className="text-xs text-muted-foreground">{statusMessage}</p> : null}
          </div>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Cargando items...</p> : null}

      {(items ?? []).map((item) => (
        <MarketplaceItemCard key={item.id} item={item} onMutate={mutate} />
      ))}
    </div>
  );
}

function MarketplaceItemCard({ item, onMutate }: { item: Item; onMutate: () => Promise<Item[] | undefined> }) {
  const [status, setStatus] = useState<Item['status']>(item.status);
  const [title, setTitle] = useState(item.title);
  const [subtitle, setSubtitle] = useState(item.subtitle ?? '');
  const [saving, setSaving] = useState(false);

  const [priceMode, setPriceMode] = useState<Price['billingType']>('monthly');
  const [priceAmount, setPriceAmount] = useState('0');
  const [priceCurrency, setPriceCurrency] = useState('usd');
  const [priceEnabled, setPriceEnabled] = useState(true);

  async function saveItem() {
    setSaving(true);
    await fetch(`/api/plugins/marketplace/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, subtitle: subtitle || null, status }),
    });
    setSaving(false);
    await onMutate();
  }

  async function removeItem() {
    await fetch(`/api/plugins/marketplace/items/${item.id}`, { method: 'DELETE' });
    await onMutate();
  }

  async function addPrice() {
    await fetch(`/api/plugins/marketplace/items/${item.id}/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingType: priceMode,
        amount: Number(priceAmount),
        currency: priceCurrency,
        enabled: priceEnabled,
      }),
    });

    await onMutate();
  }

  async function updatePrice(priceId: number, payload: Partial<Price>) {
    await fetch(`/api/plugins/marketplace/items/${item.id}/prices/${priceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await onMutate();
  }

  async function deletePrice(priceId: number) {
    await fetch(`/api/plugins/marketplace/items/${item.id}/prices/${priceId}`, { method: 'DELETE' });
    await onMutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{item.title}</span>
          <Badge variant={item.status === 'active' ? 'default' : 'outline'}>{item.status}</Badge>
        </CardTitle>
        <CardDescription>Item #{item.id} · categoría {item.category}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <Label>Título</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as Item['status'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">draft</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="archived">archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Subtítulo</Label>
            <Input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={saveItem} disabled={saving}>{saving ? 'Guardando...' : 'Guardar item'}</Button>
          <Button variant="destructive" onClick={removeItem}>Eliminar item</Button>
        </div>

        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-sm font-semibold">Precios (CRUD visual)</p>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-2">
              <Label>Modalidad</Label>
              <Select value={priceMode} onValueChange={(value) => setPriceMode(value as Price['billingType'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {billingModes.map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Monto (centavos)</Label>
              <Input value={priceAmount} onChange={(event) => setPriceAmount(event.target.value)} type="number" min={0} />
            </div>
            <div className="space-y-2">
              <Label>Moneda</Label>
              <Input value={priceCurrency} onChange={(event) => setPriceCurrency(event.target.value.toLowerCase())} maxLength={3} />
            </div>
            <div className="space-y-2">
              <Label>Habilitado</Label>
              <Select value={priceEnabled ? 'yes' : 'no'} onValueChange={(value) => setPriceEnabled(value === 'yes')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Sí</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={addPrice}>Agregar precio</Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Regla de vigencia para {priceMode}: {validityRules[priceMode]}</p>

          <div className="space-y-2">
            {item.prices.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin precios aún.</p>
            ) : (
              item.prices.map((price) => (
                <div key={price.id} className="rounded border p-2 text-sm flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{price.billingType}</Badge>
                  <span>{price.amount} {price.currency.toUpperCase()}</span>
                  <span className="text-xs text-muted-foreground">{validityRules[price.billingType]}</span>
                  <Button size="sm" variant="secondary" onClick={() => updatePrice(price.id, { enabled: !price.enabled })}>
                    {price.enabled ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updatePrice(price.id, { billingType: 'monthly' })}>
                    Marcar mensual
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deletePrice(price.id)}>
                    Borrar
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
