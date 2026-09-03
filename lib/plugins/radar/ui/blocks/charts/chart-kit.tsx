'use client';

/**
 * Piezas internas compartidas por los bloques de gráfico de Radar.
 *
 * No se exporta desde el barrel: es plomería (guard de SSR, ejes, tooltip,
 * leyenda, armado de filas) que sólo consumen los ocho componentes de esta
 * carpeta.
 */
import { useEffect, useState } from 'react';
import type { RadarSeries, RadarTone } from '@/lib/plugins/radar/shared/blocks';
import { formatValue, toneAt, toneHex, type ValueFormat } from '../primitives';

/** Campos comunes a todos los bloques de gráfico (`chartBase` del contrato). */
export type ChartFrameOptions = {
  height?: number;
  valueFormat?: 'number' | 'percent' | 'currency' | 'compact';
  currency?: string;
  legend?: boolean;
};

export const DEFAULT_CHART_HEIGHT = 220;

/**
 * Recharts mide su contenedor con la API del DOM. En el render del servidor no
 * hay contenedor que medir, así que el gráfico se pintaría con tamaño 0 y el
 * cliente lo reemplazaría entero en la hidratación. Montamos recién en el
 * cliente y reservamos el alto exacto mientras tanto.
 */
export function useChartMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

/**
 * Contenedor de alto fijo. El `text-neutral-*` no es decorativo: los ejes y la
 * grilla de recharts se pintan con `currentColor` y lo heredan de acá, que es
 * lo que los hace legibles en ambos temas sin duplicar paletas.
 */
export function ChartFrame({
  height,
  mounted,
  className = '',
  children,
}: {
  height: number;
  mounted: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`w-full text-neutral-400 dark:text-neutral-500 ${className}`}
      style={{ height }}
    >
      {mounted
        ? children
        : <div className="h-full w-full animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800/60" />}
    </div>
  );
}

export function chartHeight(options: ChartFrameOptions): number {
  const raw = options.height;
  return Number.isFinite(raw) && (raw as number) > 0 ? (raw as number) : DEFAULT_CHART_HEIGHT;
}

export function chartFormatter(options: ChartFrameOptions) {
  const format: ValueFormat = options.valueFormat ?? 'number';
  const currency = options.currency ?? 'ARS';
  return (value: number | string | null | undefined) => formatValue(value, format, currency);
}

export const AXIS_TICK = { fill: 'currentColor', fontSize: 11 } as const;

export const GRID_PROPS = {
  stroke: 'currentColor',
  strokeOpacity: 0.18,
  strokeDasharray: '3 3',
} as const;

export const AXIS_PROPS = {
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: false,
  stroke: 'currentColor',
  strokeOpacity: 0.25,
} as const;

/**
 * Tooltip propio: el de recharts trae fondo blanco fijo y se vuelve ilegible en
 * modo oscuro. Se pasa como elemento (`content={<ChartTooltipContent … />}`) y
 * recharts lo clona inyectándole `active` / `payload` / `label`.
 */
export function ChartTooltipContent(props: {
  active?: boolean;
  payload?: Array<Record<string, unknown>>;
  label?: unknown;
  fmt?: (value: number | string | null | undefined) => string;
}) {
  const { active, payload, label, fmt } = props;
  if (!active || !payload?.length) return null;
  const format = fmt ?? ((value: number | string | null | undefined) => formatValue(value));
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95">
      {label !== undefined && label !== null && label !== '' && (
        <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
          {String(label)}
        </p>
      )}
      <ul className="space-y-0.5">
        {payload.map((entry, index) => {
          const row = (entry.payload ?? {}) as Record<string, unknown>;
          const key = typeof entry.dataKey === 'string' ? entry.dataKey : '';
          const hint = row[`${key}__hint`] ?? row.__hint;
          return (
            <li key={index} className="flex items-center gap-2 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: typeof entry.color === 'string' ? entry.color : toneHex('neutral') }}
              />
              <span className="min-w-0 flex-1 truncate text-neutral-500 dark:text-neutral-400">
                {String(entry.name ?? '')}
              </span>
              <span className="font-bold tabular-nums text-neutral-900 dark:text-white">
                {format(entry.value as number)}
              </span>
              {typeof hint === 'string' && hint !== '' && (
                <span className="max-w-[10rem] truncate text-[11px] text-neutral-400 dark:text-neutral-500">{hint}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type LegendItem = { name: string; color: string };

/** Leyenda propia en HTML: misma tipografía que el resto del plugin. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.name} className="flex min-w-0 items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="truncate text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{item.name}</span>
        </li>
      ))}
    </ul>
  );
}

export type SeriesKey = { key: string; name: string; color: string; tone: RadarTone };
export type ChartRow = Record<string, string | number | null>;

/**
 * Aplana varias series en las filas que espera recharts. Las claves son
 * sintéticas (`s0`, `s1`…) porque dos series pueden llamarse igual y `name` no
 * sirve como dataKey. El `hint` de cada punto viaja como `<key>__hint` para que
 * el tooltip lo encuentre sin una estructura aparte.
 */
export function mergeSeries(series: RadarSeries[] | undefined): { rows: ChartRow[]; keys: SeriesKey[] } {
  const usable = (series ?? []).filter((serie) => Array.isArray(serie.points) && serie.points.length > 0);
  if (!usable.length) return { rows: [], keys: [] };

  const keys: SeriesKey[] = usable.map((serie, index) => {
    const tone = toneAt(index, serie.tone);
    return { key: `s${index}`, name: serie.name, color: toneHex(tone), tone };
  });

  const byLabel = new Map<string, ChartRow>();
  const order: string[] = [];
  usable.forEach((serie, index) => {
    const key = keys[index].key;
    for (const point of serie.points) {
      let row = byLabel.get(point.label);
      if (!row) {
        row = { label: point.label };
        byLabel.set(point.label, row);
        order.push(point.label);
      }
      row[key] = Number.isFinite(point.value) ? point.value : null;
      if (point.hint) row[`${key}__hint`] = point.hint;
    }
  });

  return { rows: order.map((label) => byLabel.get(label) as ChartRow), keys };
}

/** Ancho del eje de categorías en gráficos horizontales, según la etiqueta más larga. */
export function categoryAxisWidth(labels: string[]): number {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  return Math.min(150, Math.max(64, longest * 7 + 12));
}

/** `useId` devuelve algo como `:r3:` y los dos puntos rompen `url(#id)`. */
export function svgSafeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}
