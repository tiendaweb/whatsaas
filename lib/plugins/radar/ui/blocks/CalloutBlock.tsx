'use client';

/** `callout` — aviso con borde izquierdo grueso. La variante define tono e icono. */
import type { RadarBlock, RadarIcon, RadarTone } from '@/lib/plugins/radar/shared/blocks';
import { BlockHeader, toneClasses } from './primitives';
import { Markdown } from './markdown';

export type CalloutBlockData = Extract<RadarBlock, { type: 'callout' }>;

const VARIANT: Record<'info' | 'success' | 'warning' | 'danger' | 'idea', { tone: RadarTone; icon: RadarIcon }> = {
  info: { tone: 'sky', icon: 'Info' },
  success: { tone: 'emerald', icon: 'CheckCircle2' },
  warning: { tone: 'amber', icon: 'AlertTriangle' },
  danger: { tone: 'rose', icon: 'AlertOctagon' },
  idea: { tone: 'violet', icon: 'Lightbulb' },
};

export function CalloutBlock({ block }: { block: CalloutBlockData }) {
  const config = VARIANT[block.variant ?? 'info'];
  const tone = block.tone ?? config.tone;
  const classes = toneClasses(tone);
  const icon = block.icon ?? config.icon;

  return (
    <div className={`min-w-0 rounded-2xl border-l-4 p-3.5 ${classes.border} ${classes.surface}`}>
      <BlockHeader icon={icon} title={block.title} subtitle={block.subtitle} tone={tone} />
      {block.format === 'markdown' ? (
        <Markdown text={block.body} />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
          {block.body}
        </p>
      )}
    </div>
  );
}
