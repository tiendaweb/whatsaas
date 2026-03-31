import { Badge } from '@/components/ui/badge';
import type { MarketplaceItemPrice } from '@/lib/db/schema';

type Props = {
  prices?: MarketplaceItemPrice[];
  size?: 'sm' | 'default';
};

export function PricingBadge({ prices = [], size = 'default' }: Props) {
  const enabledPrices = prices.filter((p) => p.enabled);

  if (enabledPrices.length === 0) {
    return (
      <Badge variant="secondary" className={size === 'sm' ? 'text-xs' : ''}>
        Gratis
      </Badge>
    );
  }

  const parts: string[] = [];

  for (const price of enabledPrices) {
    const formatted = `$${(price.amount / 100).toFixed(2)}`;
    switch (price.billingType) {
      case 'free':
        parts.push('Gratis');
        break;
      case 'monthly':
        parts.push(`${formatted}/mes`);
        break;
      case 'annual':
        parts.push(`${formatted}/año`);
        break;
      case 'installation':
        parts.push(`Instalación: ${formatted}`);
        break;
      default:
        parts.push(`${formatted} (${price.billingType})`);
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      {parts.map((part, i) => (
        <Badge
          key={i}
          variant={part === 'Gratis' ? 'secondary' : 'default'}
          className={size === 'sm' ? 'text-xs' : ''}
        >
          {part}
        </Badge>
      ))}
    </div>
  );
}
