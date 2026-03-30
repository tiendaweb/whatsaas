'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';

type MarketplaceDetailPageProps = {
  slug?: string[];
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

  const { data: entitlementsData } = useSWR<TeamMarketplaceEntitlement[]>(
    '/api/plugins/marketplace/entitlements',
    fetcher,
  );

  const activeEntitlement = Number.isInteger(numericItemId)
    ? (entitlementsData ?? []).find((entitlement) => entitlement.itemId === numericItemId && entitlement.status === 'active')
    : null;

  return (
    <div className="space-y-4 p-6">
      <h2 className="text-2xl font-semibold">Detalle de mejora</h2>
      <p className="text-sm text-muted-foreground">Ficha del paquete seleccionado en el marketplace.</p>
      <div className="rounded-lg border p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-medium">App ID</p>
          {activeEntitlement ? <Badge>Activa para este equipo</Badge> : <Badge variant="secondary">No contratada</Badge>}
        </div>
        <p className="text-muted-foreground">{appId}</p>
        {activeEntitlement ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Activa desde: {new Date(activeEntitlement.startsAt).toLocaleString()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
