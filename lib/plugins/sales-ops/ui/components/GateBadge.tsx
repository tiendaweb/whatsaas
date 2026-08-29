'use client';

import { cn } from '@/lib/utils';
import { GATE_LABELS, type Gate } from '../../shared/taxonomy';

/**
 * Tonos por gate. Mapa cerrado con clases literales: Tailwind v4 no genera
 * clases desde strings armados en runtime.
 */
const GATE_TONES: Record<Gate, string> = {
  G0: 'bg-muted text-muted-foreground',
  G1: 'bg-muted text-muted-foreground',
  G2: 'bg-muted text-foreground/70',
  G3: 'bg-muted text-foreground/80',
  G4: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  G5: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  G6: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  G7: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  G8: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  G9: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200',
  G10: 'bg-emerald-600/25 text-emerald-900 dark:text-emerald-100',
  G11: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  GX: 'bg-red-500/15 text-red-700 dark:text-red-300',
};

/** Colores de las barras de distribución (Hoy), mismo criterio que el badge. */
export const GATE_BAR_TONES: Record<Gate, string> = {
  G0: 'bg-muted-foreground/30',
  G1: 'bg-muted-foreground/35',
  G2: 'bg-muted-foreground/40',
  G3: 'bg-muted-foreground/50',
  G4: 'bg-sky-500/60',
  G5: 'bg-sky-500/70',
  G6: 'bg-amber-500/70',
  G7: 'bg-orange-500/70',
  G8: 'bg-emerald-500/60',
  G9: 'bg-emerald-500/75',
  G10: 'bg-emerald-600/90',
  G11: 'bg-violet-500/60',
  GX: 'bg-red-500/60',
};

export function GateBadge({ gate, withLabel, className }: { gate: Gate | null | undefined; withLabel?: boolean; className?: string }) {
  if (!gate) {
    return <span className={cn('inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground', className)}>—</span>;
  }
  const tone = GATE_TONES[gate] ?? GATE_TONES.G0;
  return (
    <span
      title={GATE_LABELS[gate]}
      className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', tone, className)}
    >
      {gate}
      {withLabel && <span className="font-medium uppercase tracking-wide opacity-90">· {GATE_LABELS[gate]}</span>}
    </span>
  );
}
