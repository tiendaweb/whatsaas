'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PricingBadge } from './PricingBadge';
import type { MarketplaceItem } from '@/lib/db/schema';
import { useRouter } from '@/i18n/routing';

type Props = {
  item: MarketplaceItem;
};

export function MarketplaceItemCard({ item }: Props) {
  const router = useRouter();

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => router.push(`/plugins/marketplace/${item.id}`)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {item.iconUrl ? (
            <img
              src={item.iconUrl}
              alt={item.title}
              className="h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary text-xl font-bold">
              {item.title.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight truncate">{item.title}</h3>
            {item.subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {item.subtitle}
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="text-xs">
            {item.category}
          </Badge>
          <PricingBadge item={item} size="sm" />
        </div>
        {item.tag && (
          <Badge variant="secondary" className="mt-2 text-xs">
            {item.tag}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
