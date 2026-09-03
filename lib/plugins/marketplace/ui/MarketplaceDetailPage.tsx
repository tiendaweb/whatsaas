'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';

type MarketplaceDetailPageProps = {
  slug?: string[];
};

type MarketplaceItem = {
  id: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  prices?: Array<{ amount: number; currency: string; billingType: string; enabled: boolean }>;
};

type TeamMarketplaceEntitlement = {
  itemId: number;
  status: string;
  startsAt: string;
  endsAt: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function MarketplaceDetailPage({ slug }: MarketplaceDetailPageProps) {
  const appId = slug?.[1] ?? 'unknown-app';
  const numericItemId = Number(appId);

  const { data: item } = useSWR<MarketplaceItem>(
    Number.isInteger(numericItemId) ? `/api/plugins/marketplace/items/${numericItemId}` : null,
    fetcher,
  );
  const { data: entitlementsData } = useSWR<TeamMarketplaceEntitlement[]>(
    '/api/plugins/marketplace/entitlements',
    fetcher,
  );

  const activeEntitlement = Number.isInteger(numericItemId)
    ? (entitlementsData ?? []).find((entitlement) => entitlement.itemId === numericItemId && entitlement.status === 'active')
    : null;
  const activePrice = item?.prices?.find((price) => price.enabled && price.amount > 0) ?? item?.prices?.find((price) => price.enabled) ?? item?.prices?.[0];

  return (
    <div className="space-y-4 p-6">
      <h2 className="text-2xl font-semibold">Detalle de mejora</h2>
      <p className="text-sm text-muted-foreground">Ficha del paquete seleccionado en el marketplace.</p>
      <div className="rounded-lg border p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-medium">{item?.title ?? 'App ID'}</p>
          {activeEntitlement ? <Badge>Activa para este equipo</Badge> : <Badge variant="secondary">No contratada</Badge>}
        </div>
        <p className="text-muted-foreground">{item?.subtitle ?? appId}</p>
        {activePrice ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Desde {new Intl.NumberFormat('es-ES', {
              style: 'currency',
              currency: activePrice.currency.toUpperCase(),
              minimumFractionDigits: 0,
            }).format(activePrice.amount / 100)} / {activePrice.billingType === 'monthly' ? 'mensual' : activePrice.billingType === 'yearly' ? 'anual' : activePrice.billingType === 'setup' ? 'setup' : activePrice.billingType === 'one_time' ? 'pago único' : activePrice.billingType}
          </p>
        ) : null}
        {activeEntitlement ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Activa desde: {new Date(activeEntitlement.startsAt).toLocaleString()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
