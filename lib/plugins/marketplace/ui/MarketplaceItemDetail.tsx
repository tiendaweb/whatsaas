import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PricingBadge } from './PricingBadge';
import { RequestDialog } from './RequestDialog';
import type { MarketplaceItem, MarketplaceItemPrice } from '@/lib/db/schema';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';

type Props = {
  item: MarketplaceItem & { prices: MarketplaceItemPrice[] };
};

export function MarketplaceItemDetail({ item }: Props) {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link
        href="/plugins/marketplace"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Mejoras
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {item.iconUrl ? (
          <img
            src={item.iconUrl}
            alt={item.title}
            className="h-20 w-20 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-primary/10 text-primary text-3xl font-bold">
            {item.title.charAt(0)}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{item.title}</h1>
          {item.subtitle && (
            <p className="text-muted-foreground mt-1">{item.subtitle}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Badge variant="outline" className="capitalize">
              {item.category}
            </Badge>
            {item.tags?.map((tag) => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
            <PricingBadge prices={item.prices} />
          </div>
        </div>
        <RequestDialog item={item} />
      </div>

      <Separator />

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Descripción</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
            {item.description}
          </div>
        </CardContent>
      </Card>

      {/* Pricing Table */}
      {item.prices && item.prices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Precios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {item.prices.filter((p) => p.enabled).map((price) => (
                <PriceBox
                  key={price.id}
                  label={billingTypeLabel(price.billingType)}
                  value={price.billingType === 'free' ? 'Gratis' : `$${(price.amount / 100).toFixed(2)}`}
                  highlight
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interface Blocks */}
      {item.interfaceBlocks && (item.interfaceBlocks as Array<{ html: string }>).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Vista previa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(item.interfaceBlocks as Array<{ html: string }>).map((block, i) => (
              <div
                key={i}
                className="overflow-hidden"
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Custom Fields */}
      {item.customFields && (item.customFields as Array<{ label: string; key: string; value: string }>).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Características</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {(item.customFields as Array<{ label: string; key: string; value: string }>).map((field, i) => (
                <div key={i} className="flex justify-between py-2.5">
                  <span className="text-sm text-muted-foreground">{field.label}</span>
                  <span className="text-sm font-medium">{field.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function billingTypeLabel(type: string): string {
  switch (type) {
    case 'free': return 'Gratis';
    case 'monthly': return 'Mensual';
    case 'annual': return 'Anual';
    case 'installation': return 'Instalación';
    default: return type;
  }
}

function PriceBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 text-center ${
        highlight ? 'border-primary bg-primary/5' : ''
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold mt-1 ${highlight ? 'text-primary' : ''}`}>
        {value}
      </p>
    </div>
  );
}
