'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { Building2, CheckCircle2, DollarSign, Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DesktopPage } from '../DesktopPage';
import { StatRow } from '../StatRow';
import { formatMoney, formatNumber } from '../format';
import { surfaceCard } from '../tokens';

type Row = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  industry: string | null;
  website: string | null;
  employees: number | null;
  annualRevenue: number | null;
  location: string | null;
  customerSince: string | null;
  contactsCount: number;
  href: string;
};

type Stats = { total: number; active: number; prospects: number; enterprise: number; totalRevenue: number; currency: string };

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

export function AccountsView() {
  const t = useTranslations('DesktopOperations');
  const locale = useLocale();
  const [search, setSearch] = useState('');

  // El estado llega como clave desde la base; si aparece uno que no está
  // traducido se muestra la clave cruda en vez de romper la fila.
  const statusLabel = (status: string) => {
    const key = `overview.views.accounts.statusLabel.${status}`;
    return t.has(key) ? t(key) : status;
  };

  const params = new URLSearchParams({ view: 'accounts' });
  if (search.trim().length >= 2) params.set('q', search.trim());

  const { data, isLoading } = useSWR<{ rows: Row[]; stats: Stats | null; allowed: boolean }>(
    `/api/escritorio/crm?${params}`,
    fetcher,
    { keepPreviousData: true },
  );

  const stats = data?.stats;
  const rows = data?.rows ?? [];

  return (
    <DesktopPage
      title={t('overview.views.accounts.title')}
      subtitle={t('overview.views.accounts.subtitle')}
    >
      {stats && (
        <StatRow
          stats={[
            { label: t('overview.views.accounts.total'), value: formatNumber(stats.total, locale), icon: Building2 },
            { label: t('overview.views.accounts.active'), value: formatNumber(stats.active, locale), icon: CheckCircle2 },
            { label: t('overview.views.accounts.enterprise'), value: formatNumber(stats.enterprise, locale), icon: Users },
            { label: t('overview.views.accounts.revenue'), value: formatMoney(stats.totalRevenue, stats.currency, locale), icon: DollarSign },
          ]}
        />
      )}

      <div className="relative max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('overview.views.common.search')}
          className="pl-9"
        />
      </div>

      {isLoading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : data && !data.allowed ? (
        <Card className={surfaceCard}>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('overview.views.common.noPermission')}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className={surfaceCard}>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground">{t('overview.views.accounts.empty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('overview.views.accounts.emptyHint')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <Link key={row.id} href={row.href}>
              <Card className={`${surfaceCard} h-full transition-shadow hover:shadow-md`}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{row.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.industry ?? row.location ?? row.email ?? '—'}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[0.6875rem]">
                      {statusLabel(row.status)}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">{t('overview.views.accounts.employees')}</dt>
                      <dd className="font-medium tabular-nums">{row.employees ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('overview.views.accounts.revenue')}</dt>
                      <dd className="font-medium tabular-nums">
                        {row.annualRevenue != null ? formatMoney(row.annualRevenue, data?.stats?.currency ?? 'USD', locale) : '—'}
                      </dd>
                    </div>
                  </dl>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3.5" aria-hidden />
                    {row.contactsCount}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </DesktopPage>
  );
}
