'use client';

import { Flame, Snowflake, Thermometer } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Temperature } from '../../shared/taxonomy';
import { TEMPERATURE_LABELS, fmtInt } from './format';

export function TemperatureIcon({ temperature, className }: { temperature: Temperature; className?: string }) {
  const common = cn('size-3.5 shrink-0', className);
  if (temperature === 'hot') return <Flame className={cn(common, 'text-orange-500')} aria-label={TEMPERATURE_LABELS.hot} />;
  if (temperature === 'warm') return <Thermometer className={cn(common, 'text-amber-500')} aria-label={TEMPERATURE_LABELS.warm} />;
  return <Snowflake className={cn(common, 'text-sky-500')} aria-label={TEMPERATURE_LABELS.cold} />;
}

/** "· 187 · 🔥": prioridad numérica y temperatura, siempre juntas. */
export function PriorityPill({ score, temperature, className }: { score: number; temperature?: Temperature; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-muted-foreground', className)}>
      <span className="text-foreground">{fmtInt(score)}</span>
      {temperature && <TemperatureIcon temperature={temperature} />}
    </span>
  );
}
