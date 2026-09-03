'use client';

import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, ScrollX, toneHex } from '../primitives';
import { chartFormatter, chartHeight } from './chart-kit';

type Props = { block: Extract<RadarBlock, { type: 'heatmap' }> };

const MIN_CELL = 26;
const MIN_OPACITY = 0.12;

export function HeatmapBlock({ block }: Props) {
  const fmt = chartFormatter(block);
  const rows = block.rows ?? [];
  const columns = block.columns ?? [];

  // La matriz llega de una IA: puede venir con menos filas que `rows` o con
  // filas más cortas que `columns`. Se lee siempre por índice y lo que falta
  // queda como "sin dato" en vez de romper el render.
  const cellAt = (rowIndex: number, columnIndex: number): number | null => {
    const value = block.values?.[rowIndex]?.[columnIndex];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const present: number[] = [];
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < columns.length; c += 1) {
      const value = cellAt(r, c);
      if (value !== null) present.push(value);
    }
  }

  const header = <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />;
  if (!rows.length || !columns.length || !present.length) {
    return <>{header}<BlockEmpty /></>;
  }

  const color = toneHex(block.tone);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min;
  const intensity = (value: number) => (span > 0 ? MIN_OPACITY + ((value - min) / span) * (1 - MIN_OPACITY) : 0.65);

  const cellHeight = Math.max(18, Math.min(44, Math.round(chartHeight(block) / (rows.length + 1)) - 4));
  const labelWidth = Math.min(96, Math.max(48, rows.reduce((width, label) => Math.max(width, label.length), 0) * 7 + 8));
  const gridStyle = { gridTemplateColumns: `repeat(${columns.length}, minmax(${MIN_CELL}px, 1fr))` };
  // Sin ancho mínimo la grilla se comprime hasta volver ilegibles las celdas:
  // preferimos que scrollee en horizontal dentro del bloque.
  const minWidth = labelWidth + columns.length * MIN_CELL + 8;

  return (
    <>
      {header}
      <ScrollX>
        <div style={{ minWidth }}>
          <div className="flex items-end gap-1.5">
            <div className="shrink-0" style={{ width: labelWidth }} />
            <div className="grid flex-1 gap-1" style={gridStyle}>
              {columns.map((column, index) => (
                <span
                  key={`${column}-${index}`}
                  className="truncate text-center text-[10px] font-black uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500"
                >
                  {column}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-1 space-y-1">
            {rows.map((row, rowIndex) => (
              <div key={`${row}-${rowIndex}`} className="flex items-center gap-1.5">
                <span
                  className="shrink-0 truncate text-[11px] font-semibold text-neutral-500 dark:text-neutral-400"
                  style={{ width: labelWidth }}
                >
                  {row}
                </span>
                <div className="grid flex-1 gap-1" style={gridStyle}>
                  {columns.map((column, columnIndex) => {
                    const value = cellAt(rowIndex, columnIndex);
                    return (
                      <div
                        key={`${column}-${columnIndex}`}
                        role="img"
                        aria-label={`${row} · ${column}: ${value === null ? 'sin dato' : fmt(value)}`}
                        title={`${row} · ${column}: ${value === null ? 'sin dato' : fmt(value)}`}
                        className={`rounded-md ${value === null ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`}
                        style={{
                          height: cellHeight,
                          background: value === null ? undefined : color,
                          opacity: value === null ? 1 : intensity(value),
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollX>

      {(block.legend ?? true) && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
            {fmt(min)}
          </span>
          <div
            className="h-2 flex-1 rounded-full"
            style={{ background: `linear-gradient(to right, ${color}1f, ${color})` }}
          />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
            {fmt(max)}
          </span>
        </div>
      )}
    </>
  );
}

export default HeatmapBlock;
