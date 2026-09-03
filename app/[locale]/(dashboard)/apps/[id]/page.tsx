'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { ArrowLeft, Check, CircleAlert, Loader2, PackageCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MarketplaceItem } from '@/lib/db/schema';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type AppPrice = {
  id: number;
  amount: number;
  currency: string;
  billingType: string;
  enabled: boolean;
};

type AppDetail = MarketplaceItem & { prices?: AppPrice[] };
type RequestStatus = { kind: 'success' | 'error'; message: string } | null;

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Request failed.');
  return response.json();
};

export default function AppDetailPage() {
  const t = useTranslations('Apps');
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const appId = params?.id;
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>(null);

  const { data: app, isLoading, error, mutate } = useSWR<AppDetail>(
    appId ? `/api/plugins/marketplace/items/${appId}` : null,
    fetcher,
  );

  const activePrice = useMemo(() => app?.prices?.find((price) => price.enabled && price.amount > 0)
    ?? app?.prices?.find((price) => price.enabled)
    ?? app?.prices?.[0]
    ?? null, [app?.prices]);

  async function handleRequestApp() {
    if (!app || !activePrice) return;
    setIsRequesting(true);
    setRequestStatus(null);
    try {
      const response = await fetch('/api/plugins/marketplace/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: app.id, lines: [{ priceId: activePrice.id, quantity: 1 }] }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || t('request_error'));
      setRequestStatus({ kind: 'success', message: t('request_success') });
    } catch (requestError) {
      setRequestStatus({ kind: 'error', message: requestError instanceof Error ? requestError.message : t('request_error') });
    } finally {
      setIsRequesting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-muted/40" aria-busy="true">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-muted/40 p-5 text-center">
        <div className="max-w-sm rounded-2xl border border-border bg-card p-7 shadow-sm">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><CircleAlert className="size-5" /></span>
          <h1 className="mt-4 text-lg font-bold">{t('detail_load_error')}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('load_error_detail')}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" onClick={() => router.push('/apps')}>{t('back_to_apps')}</Button>
            <Button onClick={() => void mutate()}>{t('retry')}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] overflow-y-auto bg-muted/40 text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-8">
          <Button variant="ghost" className="-ml-2" onClick={() => router.push('/apps')}>
            <ArrowLeft className="size-4" />
            {t('back_to_catalog')}
          </Button>
          {app.isDefault ? <Badge variant="secondary"><Check className="size-3" />{t('by_default')}</Badge> : null}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
        <section className="overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-sm">
          <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
            <div className="p-5 sm:p-7 md:p-10">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <AppIcon app={app} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{app.category}</p>
                  <h1 className="mt-2 text-3xl font-bold tracking-[-0.05em] md:text-5xl">{app.title}</h1>
                  {app.subtitle ? <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">{app.subtitle}</p> : null}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Badge variant="outline">{app.category}</Badge>
                    {activePrice ? <Badge variant="secondary">{formatPrice(activePrice, locale, t)}</Badge> : null}
                  </div>
                </div>
              </div>

              {app.imageUrl ? (
                <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-muted">
                  <img src={app.imageUrl} alt={t('preview_alt', { name: app.title })} className="max-h-[34rem] w-full object-cover" />
                </div>
              ) : null}

              <div className="mt-8 border-t border-border pt-7">
                <h2 className="text-lg font-bold">{t('app_description')}</h2>
                <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-7 text-muted-foreground">{app.description || t('no_description')}</p>
              </div>
            </div>

            <aside className="border-t border-border bg-muted/25 p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
              <div className="lg:sticky lg:top-24">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{t('availability')}</p>
                <p className="mt-3 text-3xl font-bold tracking-[-0.04em]">{activePrice ? formatPrice(activePrice, locale, t) : t('consult_price')}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{app.isDefault ? t('default_app_notice') : t('request_description')}</p>

                {app.isDefault ? (
                  <div className="mt-6 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 text-sm font-bold text-primary">
                    <Check className="size-4" />
                    {t('included_in_team')}
                  </div>
                ) : (
                  <Button className="mt-6 h-11 w-full rounded-xl" disabled={!activePrice || isRequesting} onClick={handleRequestApp}>
                    {isRequesting ? <Loader2 className="size-4 animate-spin" /> : null}
                    {isRequesting ? t('requesting') : t('request_app')}
                  </Button>
                )}

                {requestStatus ? (
                  <p className={cn(
                    'mt-4 rounded-xl border p-3 text-sm leading-6',
                    requestStatus.kind === 'success' ? 'border-primary/25 bg-primary/10 text-foreground' : 'border-destructive/25 bg-destructive/10 text-destructive',
                  )}>{requestStatus.message}</p>
                ) : null}

                {app.features?.length ? (
                  <div className="mt-8 border-t border-border pt-6">
                    <h2 className="text-sm font-bold">{t('app_features')}</h2>
                    <ul className="mt-4 space-y-4">
                      {app.features.filter((feature) => feature.enabled !== false).map((feature) => (
                        <li key={feature.id ?? feature.name} className="flex gap-3">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="size-3" /></span>
                          <div>
                            <p className="text-sm font-semibold">{feature.name}</p>
                            {feature.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{feature.description}</p> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {app.tags?.length ? (
                  <div className="mt-8 border-t border-border pt-6">
                    <h2 className="text-sm font-bold">{t('app_tags')}</h2>
                    <div className="mt-3 flex flex-wrap gap-2">{app.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

function AppIcon({ app }: { app: AppDetail }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] border border-border bg-primary/10 text-primary shadow-sm md:size-24">
      {app.iconUrl && !failed ? (
        <img src={app.iconUrl} alt={app.title} className="size-full bg-background object-contain p-3" onError={() => setFailed(true)} />
      ) : <PackageCheck className="size-9" />}
    </span>
  );
}

function formatPrice(price: AppPrice, locale: string, t: ReturnType<typeof useTranslations<'Apps'>>) {
  if (price.billingType === 'quote') return t('consult_price');
  if (price.billingType === 'free' || price.amount === 0) return t('free');
  const amount = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(price.amount / 100);
  return `${amount} / ${t(`billing_${price.billingType}` as 'billing_monthly')}`;
}
