'use client';

import { Flame, Snowflake, Thermometer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Temperatura de un prospecto.
 *
 * Lleva icono además del color: el estado nunca se comunica sólo por color, y
 * "caliente/tibio/frío" es justo el caso donde un daltónico vería tres badges
 * iguales.
 */
const STYLES: Record<string, { className: string; icon: typeof Flame; label: string }> = {
  hot: { className: 'border-transparent bg-[#fee2e2] text-[#b91c1c] dark:bg-[#7f1d1d]/40 dark:text-[#fca5a5]', icon: Flame, label: 'Caliente' },
  warm: { className: 'border-transparent bg-[#fef3c7] text-[#b45309] dark:bg-[#78350f]/40 dark:text-[#fcd34d]', icon: Thermometer, label: 'Tibio' },
  cold: { className: 'border-transparent bg-[#e2eae2] text-[#647964] dark:bg-[#334633]/60 dark:text-[#95a895]', icon: Snowflake, label: 'Frío' },
};

export function TemperatureBadge({ temperature, label }: { temperature: string; label?: string }) {
  const style = STYLES[temperature] ?? STYLES.warm;
  const Icon = style.icon;
  return (
    <Badge className={cn('gap-1 text-[0.6875rem] font-medium', style.className)}>
      <Icon className="size-3" aria-hidden />
      {label ?? style.label}
    </Badge>
  );
}
