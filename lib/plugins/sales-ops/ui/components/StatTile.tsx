'use client';

import { cn } from '@/lib/utils';

import { fmtInt, panel } from './format';

/** Contador clicable del dashboard Hoy. Dos columnas en 390 px. */
export function StatTile({
  label,
  value,
  hint,
  onClick,
  active,
}: {
  label: string;
  value: number;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left',
        panel,
        onClick && 'transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'ring-1 ring-primary',
      )}
    >
      <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{fmtInt(value)}</span>
      {hint && <span className="truncate text-[11px] text-muted-foreground">{hint}</span>}
    </Comp>
  );
}
