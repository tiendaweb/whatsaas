'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { surfaceCard } from '../tokens';
import { formatMoney } from '../format';
import type { DesktopTopDeal } from '@/lib/desktop/types';

type Props = {
  deals: DesktopTopDeal[];
  locale: string;
  labels: { title: string; empty: string; probability: string };
  stageLabel: (stage: string) => string;
};

export function TopDeals({ deals, locale, labels, stageLabel }: Props) {
  return (
    <Card className={surfaceCard}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{labels.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {deals.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="space-y-4">
            {deals.map((deal) => (
              <li key={deal.id}>
                <Link
                  href={deal.href}
                  className="group flex flex-col gap-2 rounded-xl p-2 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[0.9375rem] font-semibold">{deal.title}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {deal.company || stageLabel(deal.stage)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(deal.value, deal.currency, locale)}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={deal.probability} className="h-2 flex-1" />
                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {deal.probability}% · {stageLabel(deal.stage)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
