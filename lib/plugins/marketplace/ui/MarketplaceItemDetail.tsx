import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PricingBadge } from './PricingBadge';
import { RequestDialog } from './RequestDialog';
import type { MarketplaceItem } from '@/lib/db/schema';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';

type Props = {
  item: MarketplaceItem;
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
            {item.tag && <Badge variant="secondary">{item.tag}</Badge>}
            <PricingBadge item={item} />
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Precios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <PriceBox
              label="Gratis"
              value={item.isFree ? 'Sí' : 'No'}
              highlight={item.isFree}
            />
            <PriceBox
              label="Mensual"
              value={item.monthlyPrice ? `$${item.monthlyPrice}` : '-'}
              highlight={!!item.monthlyPrice}
            />
            <PriceBox
              label="Anual"
              value={item.annualPrice ? `$${item.annualPrice}` : '-'}
              highlight={!!item.annualPrice}
            />
            <PriceBox
              label="Instalación"
              value={item.installationPrice ? `$${item.installationPrice}` : '-'}
              highlight={!!item.installationPrice}
            />
          </div>
        </CardContent>
      </Card>

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
