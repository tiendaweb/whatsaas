import { Badge } from '@/components/ui/badge';
import type { MarketplaceItem } from '@/lib/db/schema';

type Props = {
  item: MarketplaceItem;
  size?: 'sm' | 'default';
};

export function PricingBadge({ item, size = 'default' }: Props) {
  if (item.isFree && !item.installationPrice) {
    return (
      <Badge variant="secondary" className={size === 'sm' ? 'text-xs' : ''}>
        Gratis
      </Badge>
    );
  }

  const parts: string[] = [];

  if (item.isFree) {
    parts.push('Gratis');
  }
  if (item.monthlyPrice) {
    parts.push(`$${item.monthlyPrice}/mes`);
  }
  if (item.annualPrice) {
    parts.push(`$${item.annualPrice}/año`);
  }
  if (item.installationPrice) {
    parts.push(`Instalación: $${item.installationPrice}`);
  }

  if (parts.length === 0) {
    return (
      <Badge variant="outline" className={size === 'sm' ? 'text-xs' : ''}>
        Consultar
      </Badge>
    );
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
