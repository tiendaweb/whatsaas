'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';

type MarketplaceItem = {
  id: number;
  title: string;
  category: string;
  description: string | null;
};

type TeamMarketplaceEntitlement = {
  itemId: number;
  status: string;
  startsAt: string;
  endsAt: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function MarketplaceListPage() {
  const { data: itemsData } = useSWR<MarketplaceItem[]>('/api/plugins/marketplace/items', fetcher);
  const { data: entitlementsData } = useSWR<TeamMarketplaceEntitlement[]>(
    '/api/plugins/marketplace/entitlements',
    fetcher,
  );

  const items = itemsData ?? [];
  const entitlements = new Set(
    (entitlementsData ?? [])
      .filter((entitlement) => entitlement.status === 'active')
      .map((entitlement) => entitlement.itemId),
  );

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Marketplace</h2>
        <p className="text-sm text-muted-foreground">Explora mejoras para extender tu workspace tipo app store.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((app) => (
          <article key={app.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{app.category}</p>
              {entitlements.has(app.id) ? <Badge>Activa</Badge> : null}
            </div>
            <h3 className="mt-1 text-lg font-medium">{app.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{app.description ?? 'Sin descripción.'}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
