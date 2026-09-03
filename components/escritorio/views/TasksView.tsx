'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { ArrowUpRight, CalendarClock, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DesktopPage } from '../DesktopPage';
import { surfaceCard } from '../tokens';
import { cn } from '@/lib/utils';

type Row = {
  id: number;
  title: string;
  status: string;
  dueAt: string | null;
  overdue: boolean;
  project: string;
  column: string;
  assignee: string | null;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

const COLUMNS = ['todo', 'in_progress', 'done'] as const;

/**
 * Vista de tareas: lectura y navegación.
 *
 * Deliberadamente NO reimplementa la edición. Los modales de la app Tareas
 * (`ModalTarea`, `TaskModal`) exigen el modelo completo de esa app —proyectos,
 * espacios, etiquetas, checklist, relaciones, cascadas— y reutilizarlos desde
 * acá significaría cargar todo ese estado en el Escritorio y romperse cada vez
 * que la app Tareas cambie. Cada tarjeta enlaza a la app, que ya resuelve todo
 * eso bien.
 */
export function TasksView() {
  const t = useTranslations('DesktopOperations');
  const locale = useLocale();
  const { data, isLoading } = useSWR<{ rows: Row[]; allowed: boolean }>(
    '/api/escritorio/crm?view=tasks',
    fetcher,
  );

  const rows = data?.rows ?? [];
  const byStatus = (status: string) => rows.filter((row) => row.status === status);

  const dateLabel = (iso: string | null) => {
    if (!iso) return null;
    const time = new Date(iso).getTime();
    if (!Number.isFinite(time)) return null;
    return new Date(time).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  };

  return (
    <DesktopPage
      title={t('overview.views.tasks.title')}
      subtitle={t('overview.views.tasks.subtitle')}
      actions={
        <Link
          href="/plugins/tasks"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          {t('overview.views.common.viewAll')}
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {isLoading && !data ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : data && !data.allowed ? (
        <Card className={surfaceCard}>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('overview.views.common.noPermission')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((status) => {
            const items = byStatus(status);
            return (
              <div
                key={status}
                className="flex min-w-0 flex-col rounded-xl border border-border/40 bg-muted/40"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/40 p-3">
                  <span className="text-sm font-semibold">
                    {t(`overview.views.tasks.${status}` as never)}
                  </span>
                  <Badge variant="secondary" className="text-[0.6875rem]">
                    {items.length}
                  </Badge>
                </div>
                <div className="custom-scrollbar max-h-[65vh] flex-1 space-y-2 overflow-y-auto p-2">
                  {items.length === 0 ? (
                    <p className="p-6 text-center text-xs text-muted-foreground">
                      {t('overview.views.tasks.empty')}
                    </p>
                  ) : (
                    items.map((row) => (
                      <Link
                        key={row.id}
                        href="/plugins/tasks"
                        className={cn('block rounded-xl p-3 transition-shadow hover:shadow-md', surfaceCard)}
                      >
                        <p
                          className={cn(
                            'text-sm font-medium',
                            status === 'done' && 'text-muted-foreground line-through',
                          )}
                        >
                          {row.title}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {[row.project, row.column].filter(Boolean).join(' · ')}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {row.assignee && (
                            <span className="flex items-center gap-1">
                              <User className="size-3" aria-hidden />
                              {row.assignee}
                            </span>
                          )}
                          {dateLabel(row.dueAt) && (
                            <span className="flex items-center gap-1">
                              <CalendarClock className="size-3" aria-hidden />
                              {dateLabel(row.dueAt)}
                            </span>
                          )}
                          {/* "Vencida" con texto, no con un punto de color. */}
                          {row.overdue && (
                            <Badge variant="destructive" className="text-[0.6875rem]">
                              {t('overview.views.tasks.overdue')}
                            </Badge>
                          )}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DesktopPage>
  );
}
