'use client';

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { surfaceCard } from '../tokens';
import type { DesktopActivityItem } from '@/lib/desktop/types';

type Props = {
  items: DesktopActivityItem[];
  labels: { title: string; empty: string };
  formatRelative: (iso: string | null) => string;
};

/**
 * Tono → icono + color. El icono es lo que hace que el estado no dependa sólo
 * del color; el hex del círculo es decorativo.
 */
const TONES: Record<DesktopActivityItem['tone'], { icon: LucideIcon; color: string }> = {
  success: { icon: CheckCircle2, color: '#0d9488' },
  info: { icon: Info, color: '#15803d' },
  warning: { icon: AlertTriangle, color: '#d97706' },
  neutral: { icon: Activity, color: '#64748b' },
};

export function ActivityTimeline({ items, labels, formatRelative }: Props) {
  return (
    <Card className={surfaceCard}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{labels.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <div className="custom-scrollbar max-h-[400px] space-y-4 overflow-y-auto pr-2">
            {items.map((item, index) => {
              const tone = TONES[item.tone];
              const ToneIcon = tone.icon;
              const isLast = index === items.length - 1;
              return (
                <div key={item.id} className="relative flex gap-4">
                  {!isLast && (
                    <span
                      className="absolute top-10 bottom-0 left-4 w-0.5 -translate-x-px bg-border/40"
                      aria-hidden
                    />
                  )}
                  <span
                    className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    // 15 en hex ≈ 8 % de opacidad: el mismo tono del icono, apagado.
                    style={{ backgroundColor: `${tone.color}26` }}
                  >
                    <ToneIcon className="h-4 w-4" style={{ color: tone.color }} aria-hidden />
                  </span>
                  <div className="flex-1 pb-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.9375rem] font-semibold">{item.title}</p>
                        {item.description && (
                          <p className="mt-1 truncate text-sm text-muted-foreground">{item.description}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                        {formatRelative(item.at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
