'use client';

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { surfaceCard } from './tokens';

export type Stat = { label: string; value: string; icon: LucideIcon };

/** Fila de KPIs de cabecera, la misma en todas las vistas del Escritorio. */
export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map(({ label, value, icon: Icon }) => (
        <Card key={label} className={surfaceCard}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="truncate text-sm font-medium text-muted-foreground">
              {label}
            </CardTitle>
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold tabular-nums">{value}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
