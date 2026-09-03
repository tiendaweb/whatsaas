'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { Building2, Search, Sparkles, Star, Target, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { DesktopPage } from '../DesktopPage';
import { StatRow } from '../StatRow';
import { TemperatureBadge } from '../TemperatureBadge';
import { formatNumber } from '../format';
import { surfaceCard } from '../tokens';

type Row = {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  leadScore: number;
  temperature: string;
  isVip: boolean;
  jobTitle: string | null;
  stageName: string | null;
  stageEmoji: string | null;
  ownerName: string | null;
  lastContactAt: string | null;
  href: string;
};

type Stats = {
  total: number; hot: number; warm: number; cold: number;
  withStage: number; vip: number; newThisMonth: number; companies: number;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

/**
 * Prospectos y Contactos comparten tabla: son la misma entidad vista con dos
 * criterios (`leads` = los que están en el embudo). Duplicar el componente para
 * cambiar un filtro y cuatro KPIs sería garantizar que se desincronicen.
 */
export function PeopleView({ view }: { view: 'leads' | 'contacts' }) {
  const t = useTranslations('DesktopOperations');
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const [temperature, setTemperature] = useState<string | null>(null);

  const params = new URLSearchParams({ view });
  if (search.trim().length >= 2) params.set('q', search.trim());
  if (temperature) params.set('temperature', temperature);

  const { data, isLoading } = useSWR<{ rows: Row[]; stats: Stats | null; allowed: boolean }>(
    `/api/escritorio/crm?${params}`,
    fetcher,
    { keepPreviousData: true },
  );

  const stats = data?.stats;
  const rows = data?.rows ?? [];
  const isLeads = view === 'leads';

  const statCards = stats
    ? isLeads
      ? [
          { label: t('overview.views.leads.total'), value: formatNumber(stats.withStage, locale), icon: Sparkles },
          { label: t('overview.views.leads.hot'), value: formatNumber(stats.hot, locale), icon: Target },
          { label: t('overview.views.leads.staged'), value: formatNumber(stats.withStage, locale), icon: Users },
          {
            label: t('overview.views.leads.conversion'),
            // Sin contactos el porcentaje es 0, no NaN.
            value: stats.total > 0 ? `${Math.round((stats.withStage / stats.total) * 100)}%` : '0%',
            icon: Building2,
          },
        ]
      : [
          { label: t('overview.views.contacts.total'), value: formatNumber(stats.total, locale), icon: Users },
          { label: t('overview.views.contacts.companies'), value: formatNumber(stats.companies, locale), icon: Building2 },
          { label: t('overview.views.contacts.vip'), value: formatNumber(stats.vip, locale), icon: Star },
          { label: t('overview.views.contacts.new'), value: formatNumber(stats.newThisMonth, locale), icon: Sparkles },
        ]
    : [];

  const relative = (iso: string | null) => {
    if (!iso) return '—';
    const time = new Date(iso).getTime();
    // Mismo blindaje que en el Escritorio: un dato que no sea fecha no puede
    // tumbar la vista con un RangeError de Intl.
    if (!Number.isFinite(time)) return '—';
    const days = Math.round((Date.now() - time) / 86400000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    return days < 1 ? rtf.format(0, 'day') : rtf.format(-days, 'day');
  };

  return (
    <DesktopPage
      title={isLeads ? t('overview.views.leads.title') : t('overview.views.contacts.title')}
      subtitle={isLeads ? t('overview.views.leads.subtitle') : t('overview.views.contacts.subtitle')}
    >
      {stats && <StatRow stats={statCards} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('overview.views.common.search')}
            className="pl-9"
          />
        </div>
        {(['hot', 'warm', 'cold'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={temperature === value ? 'default' : 'outline'}
            aria-pressed={temperature === value}
            onClick={() => setTemperature(temperature === value ? null : value)}
          >
            <TemperatureBadge temperature={value} />
          </Button>
        ))}
      </div>

      <Card className={surfaceCard}>
        <CardContent className="p-0">
          {isLoading && !data ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : data && !data.allowed ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {t('overview.views.common.noPermission')}
            </p>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {isLeads ? t('overview.views.leads.empty') : t('overview.views.contacts.empty')}
              </p>
              {isLeads && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('overview.views.leads.emptyHint')}
                </p>
              )}
            </div>
          ) : (
            // La tabla scrollea dentro de su contenedor: el body de la página
            // nunca scrollea en horizontal.
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">
                      {isLeads ? t('overview.views.leads.title') : t('overview.views.contacts.title')}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {isLeads ? t('overview.views.leads.stage') : t('overview.views.contacts.role')}
                    </th>
                    {isLeads && (
                      <th className="px-4 py-3 font-medium">{t('overview.views.leads.score')}</th>
                    )}
                    <th className="px-4 py-3 font-medium">{t('overview.views.leads.lastContact')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={row.href} className="block min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium">{row.name}</span>
                            {row.isVip && (
                              <Star className="size-3.5 shrink-0 text-[#c2690a]" aria-label="VIP" />
                            )}
                            <TemperatureBadge temperature={row.temperature} />
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {[row.company, row.email ?? row.phone].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {isLeads ? (
                          row.stageName ? (
                            <Badge variant="secondary" className="text-[0.6875rem]">
                              {row.stageEmoji} {row.stageName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )
                        ) : (
                          <span className="truncate text-muted-foreground">{row.jobTitle || '—'}</span>
                        )}
                      </td>
                      {isLeads && (
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2">
                            <Progress value={row.leadScore} className="h-1.5 w-16" />
                            <span className="tabular-nums text-xs text-muted-foreground">
                              {row.leadScore}
                            </span>
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {relative(row.lastContactAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </DesktopPage>
  );
}
