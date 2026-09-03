'use client';

import { CalendarDays, CheckSquare, Handshake, IdCard, MessageSquare, Receipt, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommandItemKind } from '@/lib/desktop/command-center/types';

/**
 * Mapas LITERALES. Tailwind v4 no genera clases armadas en runtime, así que
 * `bg-${kind}-500` saldría sin color y nadie lo notaría hasta producción.
 */
const TONE: Record<CommandItemKind, string> = {
  chat: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  task: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20',
  membership: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  deal: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20',
  // Acromático a propósito: el celeste es justo el acento que el Escritorio
  // reemplazó por verde, y no vuelve por la puerta de atrás de un badge.
  event: 'bg-stone-500/10 text-stone-700 dark:text-stone-300 border-stone-500/20',
  finance: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
};

const ICON: Record<CommandItemKind, LucideIcon> = {
  chat: MessageSquare,
  task: CheckSquare,
  membership: IdCard,
  deal: Handshake,
  event: CalendarDays,
  finance: Receipt,
};

export function KindBadge({ kind, label }: { kind: CommandItemKind; label: string }) {
  const Icon = ICON[kind];
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        TONE[kind],
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
