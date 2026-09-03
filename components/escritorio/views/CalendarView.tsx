'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { CalendarDays, Phone, Users, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DesktopPage } from '../DesktopPage';
import { surfaceCard } from '../tokens';

type Row = {
  id: number;
  title: string;
  kind: string;
  subtype: string | null;
  startsAt: string;
  endsAt: string;
  attendees: string[];
  contactName: string | null;
  customerName: string | null;
  notes: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

export function CalendarView() {
  const t = useTranslations('DesktopOperations');
  const locale = useLocale();
  const { data, isLoading } = useSWR<{ rows: Row[]; allowed: boolean }>(
    '/api/escritorio/crm?view=calendar',
    fetcher,
  );

  const rows = data?.rows ?? [];

  // Agrupado por día: una agenda plana de 30 días es ilegible.
  const byDay = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const key = row.startsAt.slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const todayKey = new Date().toISOString().slice(0, 10);

  const dayLabel = (key: string) => {
    const date = new Date(`${key}T12:00:00Z`);
    if (key === todayKey) return t('overview.views.calendar.today');
    return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const timeLabel = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <DesktopPage
      title={t('overview.views.calendar.title')}
      subtitle={t('overview.views.calendar.subtitle')}
    >
      {isLoading && !data ? (
        <div className="space-y-4">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : data && !data.allowed ? (
        <Card className={surfaceCard}>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('overview.views.common.noPermission')}
          </CardContent>
        </Card>
      ) : byDay.length === 0 ? (
        <Card className={surfaceCard}>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('overview.views.calendar.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {byDay.map(([day, events]) => (
            <Card key={day} className={surfaceCard}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold capitalize">{dayLabel(day)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {events.map((event) => {
                  const Icon = event.kind === 'call' ? Phone : Video;
                  return (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 rounded-xl border border-border/40 p-3"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{event.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[
                            `${timeLabel(event.startsAt)}–${timeLabel(event.endsAt)}`,
                            event.customerName ?? event.contactName,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {event.attendees.length > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="size-3" aria-hidden />
                            {event.attendees.join(', ')}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-[0.6875rem]">
                        {event.kind === 'call'
                          ? t('overview.views.calendar.call')
                          : t('overview.views.calendar.meeting')}
                      </Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DesktopPage>
  );
}
