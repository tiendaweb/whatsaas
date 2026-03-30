'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

type MarketplacePrice = {
  id: number;
  billingType: string;
  amount: number;
  currency: string;
};

type MarketplaceOrderLine = {
  id: number;
  quantity: number;
  unitAmount: number;
  currency: string;
  price: MarketplacePrice | null;
};

type Entitlement = {
  id: number;
  itemId: number;
  status: string;
  startsAt: string;
  endsAt: string | null;
  metadata: Record<string, unknown>;
  item: {
    id: number;
    title: string;
    subtitle: string | null;
    category: string;
  } | null;
  sourceOrder: {
    id: number;
    status: string;
    total: number;
    lines?: MarketplaceOrderLine[];
  } | null;
};

type MarketplaceItem = {
  id: number;
  title: string;
  subtitle: string | null;
  status: string;
  prices: MarketplacePrice[];
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: (currency || 'USD').toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function billingLabel(type: string) {
  switch (type) {
    case 'monthly':
      return 'Mensual';
    case 'yearly':
      return 'Anual';
    case 'one_time':
      return 'Pago único';
    case 'free':
      return 'Gratis';
    case 'setup':
      return 'Implementación';
    default:
      return type;
  }
}

export default function SettingsUpgradesPage() {
  const { data: entitlements, isLoading } = useSWR<Entitlement[]>('/api/plugins/marketplace/entitlements', fetcher);
  const { data: items } = useSWR<MarketplaceItem[]>('/api/plugins/marketplace/items', fetcher);

  const activeEntitlements = (entitlements ?? []).filter((entry) => entry.status === 'active');
  const activeItemIds = new Set(activeEntitlements.map((entry) => entry.itemId));
  const availableItems = (items ?? []).filter((item) => item.status === 'active' && !activeItemIds.has(item.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upgrades contratados</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Consulta qué mejoras están activas para tu team y cuáles siguen disponibles en el marketplace.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activos</CardTitle>
          <CardDescription>Solo se muestran entitlements activos para este team/usuario.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <p className="text-sm text-muted-foreground">Cargando upgrades...</p> : null}

          {!isLoading && activeEntitlements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay upgrades activos aún.</p>
          ) : null}

          {activeEntitlements.map((entitlement) => {
            const firstLine = entitlement.sourceOrder?.lines?.[0];
            const amount = firstLine?.unitAmount ?? entitlement.sourceOrder?.total ?? 0;
            const currency = firstLine?.currency ?? 'usd';
            const mode = firstLine?.price?.billingType ?? String(entitlement.metadata?.billingType ?? 'one_time');

            return (
              <div key={entitlement.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{entitlement.item?.title ?? `Item #${entitlement.itemId}`}</p>
                    {entitlement.item?.subtitle ? (
                      <p className="text-xs text-muted-foreground">{entitlement.item.subtitle}</p>
                    ) : null}
                  </div>
                  <Badge>Activo</Badge>
                </div>

                <Separator className="my-3" />

                <div className="grid gap-2 text-sm md:grid-cols-3">
                  <p>
                    <span className="text-muted-foreground">Precio:</span>{' '}
                    <strong>{formatMoney(amount, currency)}</strong>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Modalidad:</span> {billingLabel(mode)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Activado:</span>{' '}
                    {new Date(entitlement.startsAt).toLocaleString()}
                  </p>
                </div>

                {entitlement.endsAt ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    Vigente hasta: {new Date(entitlement.endsAt).toLocaleString()}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">Sin fecha de vencimiento configurada.</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disponibles en marketplace</CardTitle>
          <CardDescription>
            Esta sección se mantiene en sincronía con el sidebar dinámico para diferenciar lo contratado vs lo disponible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {availableItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay upgrades adicionales disponibles en este momento.</p>
          ) : (
            availableItems.map((item) => {
              const firstPrice = item.prices.find((price) => price.amount > 0) ?? item.prices[0];
              return (
                <div key={item.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{item.title}</p>
                    <Badge variant="outline">Disponible</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{item.subtitle ?? 'Sin subtítulo'}</p>
                  {firstPrice ? (
                    <p className="text-xs mt-2">
                      Desde {formatMoney(firstPrice.amount, firstPrice.currency)} / {billingLabel(firstPrice.billingType)}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
