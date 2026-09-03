'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type MarketplaceItem = {
  id: number;
  title: string;
  subtitle: string | null;
  category: string;
  description: string | null;
  iconUrl: string | null;
  status: string;
  prices?: Array<{ id: number; amount: number; currency: string; billingType: string; enabled: boolean }>;
};

type TeamMarketplaceEntitlement = {
  itemId: number;
  status: string;
  startsAt: string;
  endsAt: string | null;
};

// Brand hex colors keyed by Simple Icons slug or Clearbit domain
const BRAND_COLORS: Record<string, string> = {
  hubspot: '#FF7A59',
  salesforce: '#00A1E0',
  'salesforce.com': '#00A1E0',
  googlesheets: '#34A853',
  shopify: '#96BF48',
  woocommerce: '#96588A',
  stripe: '#635BFF',
  mercadopago: '#009EE3',
  calendly: '#006BFF',
  slack: '#4A154B',
  'slack.com': '#4A154B',
  zapier: '#FF4A00',
  make: '#6D00CC',
  openai: '#10A37F',
  'openai.com': '#10A37F',
  whatsapp: '#25D366',
  mailchimp: '#FFE01B',
  twilio: '#F22F46',
  'twilio.com': '#F22F46',
  n8n: '#EA4B71',
  notion: '#37352F',
  googleanalytics: '#E37400',
  typeform: '#262627',
  asana: '#F06A6A',
  trello: '#0052CC',
  toggl: '#E57CD8',
  'toggl.com': '#E57CD8',
  zendesk: '#03363D',
  tableau: '#E8762D',
  'tableau.com': '#E8762D',
  postman: '#FF6C37',
  gitbook: '#3884FF',
  surveymonkey: '#00BF6F',
  'surveymonkey.com': '#00BF6F',
  hootsuite: '#1F98F4',
  'hootsuite.com': '#1F98F4',
  googlecalendar: '#4285F4',
  grafana: '#F46800',
  mermaid: '#FF3670',
  postgresql: '#336791',
  swagger: '#85EA2D',
  nodedotjs: '#339933',
  cloudflare: '#F38020',
  webflow: '#146EF5',
  'webflow.com': '#146EF5',
  webhooks: '#5865F2',
  pipedrive: '#017737',
  react: '#61DAFB',
  flutter: '#02569B',
  docker: '#2496ED',
  linkedin: '#0A66C2',
  x: '#000000',
  anthropic: '#D97706',
  'anthropic.com': '#D97706',
  meta: '#0866FF',
  tiktok: '#FF0050',
  instagram: '#E4405F',
  google: '#4285F4',
  googlemeet: '#00897B',
};

function getIconBg(iconUrl: string | null): React.CSSProperties {
  if (!iconUrl) return {};
  let key = '';
  if (iconUrl.includes('simpleicons.org')) {
    key = (iconUrl.split('/').pop() ?? '').toLowerCase();
  } else if (iconUrl.includes('clearbit.com')) {
    key = iconUrl.replace('https://logo.clearbit.com/', '').toLowerCase();
  }
  const hex = BRAND_COLORS[key];
  if (!hex) return {};
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { backgroundColor: `rgba(${r},${g},${b},0.13)` };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function MarketplaceListPage() {
  const { data: itemsData, isLoading } = useSWR<MarketplaceItem[]>('/api/plugins/marketplace/items', fetcher);
  const { data: entitlementsData, mutate: mutateEntitlements } = useSWR<TeamMarketplaceEntitlement[]>(
    '/api/plugins/marketplace/entitlements',
    fetcher,
  );
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<number | null>(null);

  const items = (itemsData ?? []).filter((item) => item.status === 'active');
  const categories = Array.from(new Set(items.map((item) => item.category))).sort();
  const filtered = selectedCategory ? items.filter((item) => item.category === selectedCategory) : items;
  const activeEntitlements = new Set(
    (entitlementsData ?? []).filter((e) => e.status === 'active').map((e) => e.itemId),
  );

  async function handleRequest(item: MarketplaceItem) {
    const price = item.prices?.find((p) => p.enabled) ?? null;
    if (!price) {
      toast.error('Este servicio no tiene precio configurado. Contacta al administrador.');
      return;
    }
    setRequesting(item.id);
    try {
      const res = await fetch('/api/plugins/marketplace/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, lines: [{ priceId: price.id, quantity: 1 }] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? 'Error al enviar la solicitud');
      }
      const isQuote = price.billingType === 'quote';
      toast.success(
        isQuote
          ? 'Solicitud enviada. Nos contactaremos contigo con precios y detalles.'
          : 'Solicitud enviada. El administrador revisará tu pedido.',
      );
      mutateEntitlements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar la solicitud');
    } finally {
      setRequesting(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-4">
        <h2 className="text-2xl font-semibold">Marketplace</h2>
        <p className="text-sm text-muted-foreground">Explora servicios y mejoras disponibles para tu negocio.</p>

        {/* Category filter */}
        {categories.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategory === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-lg border bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay servicios disponibles en esta categoría.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => {
              const isActive = activeEntitlements.has(item.id);
              const isLoadingThis = requesting === item.id;
              const hasPrice = item.prices?.some((p) => p.enabled) ?? false;

              return (
                <article key={item.id} className="flex flex-col rounded-lg border p-4">
                  {/* Icon + category + badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border p-1.5"
                        style={getIconBg(item.iconUrl)}
                      >
                        {item.iconUrl ? (
                          <img
                            src={item.iconUrl}
                            alt={item.title}
                            className="h-full w-full object-contain"
                            onError={(e) => {
                              const img = e.currentTarget as HTMLImageElement;
                              img.style.display = 'none';
                              const fb = img.nextSibling as HTMLElement | null;
                              if (fb) fb.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <span
                          style={{ display: item.iconUrl ? 'none' : 'flex' }}
                          className="h-full w-full items-center justify-center text-sm font-bold text-primary"
                        >
                          {item.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-muted-foreground">{item.category}</p>
                    </div>
                    {isActive && <Badge variant="default">Activa</Badge>}
                  </div>

                  {/* Title + subtitle + description */}
                  <h3 className="mt-3 text-base font-semibold leading-snug">{item.title}</h3>
                  {item.subtitle && (
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">{item.subtitle}</p>
                  )}
                  <p className="mt-2 flex-1 text-sm text-muted-foreground line-clamp-3">
                    {item.description ?? 'Sin descripción.'}
                  </p>

                  {/* Price + button */}
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {item.prices?.length ? formatPrice(item.prices) : 'Consultar precio'}
                    </span>
                    {!isActive && (
                      <Button
                        size="sm"
                        disabled={isLoadingThis || !hasPrice}
                        onClick={() => handleRequest(item)}
                        className="shrink-0"
                      >
                        {isLoadingThis ? 'Enviando…' : 'Solicitar'}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatPrice(prices: Array<{ amount: number; currency: string; billingType: string; enabled: boolean }>) {
  const active =
    prices.find((p) => p.enabled && p.amount > 0 && p.billingType !== 'quote' && p.billingType !== 'free') ??
    prices.find((p) => p.enabled) ??
    prices[0];

  if (!active) return 'Consultar precio';
  if (active.billingType === 'free') return 'Gratis';
  if (active.billingType === 'quote') return 'Consultar precio / cotización';

  const amount = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: active.currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(active.amount / 100);

  const label: Record<string, string> = {
    monthly: 'mensual',
    yearly: 'anual',
    setup: 'setup',
    one_time: 'pago único',
  };

  return `Desde ${amount} / ${label[active.billingType] ?? active.billingType}`;
}
