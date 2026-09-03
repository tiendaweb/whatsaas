'use client';

import Link from 'next/link';
import { CalendarClock, CheckSquare, Phone, Video, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { surfaceCard } from '../tokens';
import type { DesktopUpcomingItem } from '@/lib/desktop/types';

type Props = {
  items: DesktopUpcomingItem[];
  labels: { title: string; empty: string; high: string };
  formatRelative: (iso: string | null) => string;
};

const ICONS: Record<DesktopUpcomingItem['kind'], LucideIcon> = {
  meeting: Video,
  call: Phone,
  task: CheckSquare,
};

export function UpcomingItems({ items, labels, formatRelative }: Props) {
  return (
    <Card className={surfaceCard}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{labels.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const Icon = ICONS[item.kind] ?? CalendarClock;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatRelative(item.at)}
                      </span>
                    </span>
                    {/* "Vencida" va con texto, no con un punto de color. */}
                    {item.priority === 'high' && (
                      <Badge variant="destructive" className="shrink-0 text-[0.6875rem]">
                        {labels.high}
                      </Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
