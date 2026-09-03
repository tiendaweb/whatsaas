'use client';

/**
 * `table` — tabla compacta. Vive siempre dentro de `ScrollX`: la página nunca
 * scrollea en horizontal por culpa de una tabla.
 */
import type { RadarBlock, RadarTone } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, BlockLabel, Chip, ScrollX, formatValue, toneAt, toneClasses } from './primitives';

export type TableBlockData = Extract<RadarBlock, { type: 'table' }>;

const ALIGN: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/** Valores que en Radar siempre significan lo mismo, sin importar la columna. */
const VALUE_TONE = new Map<string, RadarTone>([
  ['p1', 'rose'], ['alta', 'rose'], ['alto', 'rose'], ['urgente', 'rose'], ['critico', 'rose'],
  ['crítico', 'rose'], ['bloqueado', 'rose'], ['perdido', 'rose'], ['no', 'rose'],
  ['p2', 'amber'], ['media', 'amber'], ['medio', 'amber'], ['pendiente', 'amber'], ['riesgo', 'amber'],
  ['p3', 'slate'], ['baja', 'slate'], ['bajo', 'slate'], ['descartado', 'neutral'], ['nulo', 'neutral'],
  ['ok', 'emerald'], ['si', 'emerald'], ['sí', 'emerald'], ['hecho', 'emerald'], ['listo', 'emerald'],
  ['activo', 'emerald'], ['ganado', 'emerald'], ['cerrado', 'emerald'],
]);

/**
 * Tono estable para un valor: primero el diccionario semántico y, si no está,
 * un color del ciclo asignado por orden de aparición — así dos filas con el
 * mismo valor siempre quedan del mismo color.
 */
function toneForValue(raw: unknown, seen: Map<string, RadarTone>): RadarTone {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return 'neutral';
  const known = VALUE_TONE.get(key);
  if (known) return known;
  const cached = seen.get(key);
  if (cached) return cached;
  const tone = toneAt(seen.size);
  seen.set(key, tone);
  return tone;
}

export function TableBlock({ block }: { block: TableBlockData }) {
  const columns = block.columns ?? [];
  const rows = block.rows ?? [];
  const seen = new Map<string, RadarTone>();

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />

      {columns.length === 0 || rows.length === 0 ? (
        <BlockEmpty />
      ) : (
        <ScrollX>
          <table className="w-full text-sm">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`whitespace-nowrap px-2.5 pb-2 font-normal ${ALIGN[column.align ?? 'left']}`}
                  >
                    <BlockLabel>{column.label}</BlockLabel>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const highlight = block.highlightKey ? row[block.highlightKey] : null;
                const rowTone = block.highlightKey && highlight != null && highlight !== ''
                  ? toneForValue(highlight, seen)
                  : null;
                const rowClasses = rowTone ? toneClasses(rowTone).surface : '';

                return (
                  <tr key={rowIndex} className={`border-t border-neutral-100 dark:border-neutral-800 ${rowClasses}`}>
                    {columns.map((column) => {
                      const value = row[column.key];
                      const align = ALIGN[column.align ?? 'left'];

                      if (column.format === 'badge') {
                        const label = value === null || value === undefined || value === ''
                          ? '—'
                          : String(value);
                        return (
                          <td key={column.key} className={`whitespace-nowrap px-2.5 py-2 ${align}`}>
                            <Chip label={label} tone={toneForValue(value, seen)} />
                          </td>
                        );
                      }

                      const text = formatValue(value, column.format ?? 'text');
                      const numeric = column.format === 'number' || column.format === 'percent' || column.format === 'currency';
                      return (
                        <td
                          key={column.key}
                          title={text}
                          className={`max-w-[16rem] truncate px-2.5 py-2 text-neutral-700 dark:text-neutral-200 ${align} ${
                            numeric ? 'font-bold tabular-nums' : ''
                          }`}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollX>
      )}
    </div>
  );
}
