'use client';

/**
 * `steps` — el esquema que contesta "¿dónde está la pelota?". El paso
 * `current` se destaca con borde de color, fondo tenue y un chip; el resto
 * queda apagado.
 */
import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import type { RadarBlock, RadarIcon, RadarTone } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, Chip, ScrollX, resolveIcon, toneClasses } from './primitives';

export type StepsBlockData = Extract<RadarBlock, { type: 'steps' }>;

type StepState = 'done' | 'current' | 'pending' | 'blocked';

const STATE: Record<StepState, { tone: RadarTone; icon: RadarIcon; label: string }> = {
  done: { tone: 'emerald', icon: 'CheckCircle2', label: 'Hecho' },
  current: { tone: 'indigo', icon: 'Target', label: 'Acá estamos' },
  pending: { tone: 'neutral', icon: 'Clock', label: 'Pendiente' },
  blocked: { tone: 'rose', icon: 'Ban', label: 'Trabado' },
};

export function StepsBlock({ block }: { block: StepsBlockData }) {
  const steps = block.steps ?? [];
  const horizontal = (block.orientation ?? 'horizontal') === 'horizontal';

  if (steps.length === 0) {
    return (
      <div className="min-w-0">
        <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
        <BlockEmpty />
      </div>
    );
  }

  const cards = steps.map((step, index) => {
    const state: StepState = step.state ?? 'pending';
    const config = STATE[state];
    // El tono del bloque manda sobre el del paso actual: así una nota entera
    // puede estar en violeta sin que el "acá estamos" salte a indigo.
    const tone = state === 'current' ? (block.tone ?? config.tone) : config.tone;
    const classes = toneClasses(tone);
    const Icon = resolveIcon(step.icon ?? config.icon);
    const current = state === 'current';

    return (
      <div
        key={`${step.label}-${index}`}
        className={`min-w-0 rounded-2xl border-2 p-3 transition-all duration-200 ${
          current
            ? `${classes.border} ${classes.surface} shadow-sm`
            : 'border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-800/60'
        } ${horizontal ? 'w-44 shrink-0' : 'flex-1'}`}
      >
        <div className="flex items-center gap-2">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${classes.soft}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 text-[10px] font-black uppercase tracking-[0.2em] tabular-nums text-neutral-400 dark:text-neutral-500">
            {String(index + 1).padStart(2, '0')}
          </span>
          {current && <Chip label={config.label} tone={tone} solid />}
        </div>

        <p
          className={`mt-2 break-words text-sm font-bold ${
            state === 'pending' ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-white'
          }`}
        >
          {step.label}
        </p>
        {step.detail && (
          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            {step.detail}
          </p>
        )}
        {!current && (
          <p className={`mt-2 text-[10px] font-black uppercase tracking-[0.2em] ${classes.text}`}>{config.label}</p>
        )}
      </div>
    );
  });

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />

      {horizontal ? (
        <ScrollX>
          <div className="flex min-w-max items-stretch gap-1.5 py-0.5">
            {cards.map((card, index) => (
              <Fragment key={index}>
                {index > 0 && (
                  <span className="flex shrink-0 items-center text-neutral-300 dark:text-neutral-600" aria-hidden="true">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
                {card}
              </Fragment>
            ))}
          </div>
        </ScrollX>
      ) : (
        <div className="flex flex-col gap-2">{cards}</div>
      )}
    </div>
  );
}
