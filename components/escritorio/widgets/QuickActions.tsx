'use client';

import { MessageCircle, Phone, Sparkles, Video, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { kpiGradient, surfaceCard } from '../tokens';

export type QuickActionId = 'lead' | 'message' | 'call' | 'meeting';

type Props = {
  labels: {
    title: string;
    items: Record<QuickActionId, { label: string; hint: string }>;
  };
  onSelect: (id: QuickActionId) => void;
};

const ACTIONS: Array<{ id: QuickActionId; icon: LucideIcon }> = [
  { id: 'lead', icon: Sparkles },
  // "Enviar mensaje", no "Send Email": acá el canal es WhatsApp.
  { id: 'message', icon: MessageCircle },
  { id: 'call', icon: Phone },
  { id: 'meeting', icon: Video },
];

export function QuickActions({ labels, onSelect }: Props) {
  return (
    <Card className={surfaceCard}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{labels.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {ACTIONS.map((action, index) => {
            const Icon = action.icon;
            const copy = labels.items[action.id];
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => onSelect(action.id)}
                className="flex items-center gap-3 rounded-xl border border-border/40 p-3 text-left transition-all hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br',
                    kpiGradient(index),
                  )}
                >
                  <Icon className="h-5 w-5 text-white" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{copy.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{copy.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
