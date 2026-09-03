'use client';

import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, formatValue, toneAt, toneHex } from '../primitives';
import { chartFormatter, chartHeight } from './chart-kit';

type Props = { block: Extract<RadarBlock, { type: 'funnel' }> };

/** Ancho mínimo de una banda: sin esto un paso en 0 desaparece del dibujo. */
const MIN_WIDTH = 8;

export function FunnelBlock({ block }: Props) {
  const fmt = chartFormatter(block);
  const steps = (block.steps ?? []).filter((step) => Number.isFinite(step.value));

  const header = <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />;
  const top = steps.length ? Math.max(...steps.map((step) => step.value)) : 0;
  if (steps.length < 2 || top <= 0) {
    return <>{header}<BlockEmpty /></>;
  }

  const showConversion = block.showConversion ?? false;
  // Cada paso ocupa su banda más ~44px de textos (etiqueta arriba, conversión
  // abajo). De ahí sale el alto de la banda, acotado para que no quede ni una
  // línea ni un bloque gigante.
  const bandHeight = Math.max(20, Math.min(56, Math.round(chartHeight(block) / steps.length) - 36));

  const widthAt = (index: number) => Math.max(MIN_WIDTH, (steps[index].value / top) * 100);

  return (
    <>
      {header}
      <ol className="space-y-0">
        {steps.map((step, index) => {
          const tone = toneAt(index, step.tone);
          const color = toneHex(tone);
          const widthTop = widthAt(index);
          // El último paso cierra recto: no hay paso siguiente al que angostar.
          const widthBottom = index === steps.length - 1 ? widthTop : widthAt(index + 1);
          // clip-path toma los cuatro vértices en sentido horario. Cada lado se
          // recorta (100 - ancho)/2 para que el trapecio quede centrado.
          const insetTop = (100 - widthTop) / 2;
          const insetBottom = (100 - widthBottom) / 2;
          const clipPath = `polygon(${insetTop}% 0%, ${100 - insetTop}% 0%, ${100 - insetBottom}% 100%, ${insetBottom}% 100%)`;

          const previous = index > 0 ? steps[index - 1].value : null;
          const conversion = previous && previous > 0 ? (step.value / previous) * 100 : null;
          const share = (step.value / top) * 100;

          return (
            <li key={`${step.label}-${index}`}>
              {showConversion && conversion !== null && (
                <p className="py-1 text-center text-[11px] font-bold tabular-nums text-neutral-400 dark:text-neutral-500">
                  ↓ {formatValue(conversion, 'percent')} de conversión
                </p>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  {step.label}
                </span>
                <span className="shrink-0 text-xs font-black tabular-nums text-neutral-900 dark:text-white">
                  {fmt(step.value)}
                  <span className="ml-1.5 font-bold text-neutral-400 dark:text-neutral-500">
                    {formatValue(share, 'percent')}
                  </span>
                </span>
              </div>
              <div
                className="mt-1 w-full"
                style={{ height: bandHeight, background: color, clipPath, WebkitClipPath: clipPath }}
                role="img"
                aria-label={`${step.label}: ${fmt(step.value)}${step.hint ? `. ${step.hint}` : ''}`}
                title={step.hint ?? undefined}
              />
            </li>
          );
        })}
      </ol>
    </>
  );
}

export default FunnelBlock;
