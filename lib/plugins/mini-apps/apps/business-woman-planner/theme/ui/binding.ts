'use client';

import type { BwLocalBinding } from '../shared/schema';

// Estas tres funciones son SÓLO para bindings `kind: "local"` (colecciones ya
// cargadas en el cliente por `useMiniAppData`). Los bindings `kind: "system"`
// se resuelven server-side — ver `useSystemBindingRows.ts`.

/** Filtra filas de una colección contra `binding.filters` (sin ordenar/limitar).
 * Por defecto también saca las archivadas (`_archived: true`, las pone
 * BwRecordDrawer) — `includeArchived: true` las vuelve a mostrar. */
export function applyFilters(rows: any[], binding: Pick<BwLocalBinding, 'filters' | 'includeArchived'>): any[] {
  const base = binding.includeArchived ? rows : rows.filter((row) => !row?._archived);
  const filters = binding.filters ?? [];
  if (!filters.length) return base;
  return base.filter((row) =>
    filters.every((filter) => {
      const value = row?.[filter.field];
      switch (filter.op) {
        case 'eq': return value === filter.value;
        case 'neq': return value !== filter.value;
        case 'contains': return typeof value === 'string' && typeof filter.value === 'string' && value.toLowerCase().includes(filter.value.toLowerCase());
        case 'is_true': return value === true;
        case 'is_false': return !value;
        default: return true;
      }
    }),
  );
}

/** Filtra + ordena + limita — lo que consumen list/table/cards. */
export function applyBinding(rows: any[], binding: BwLocalBinding): any[] {
  let result = applyFilters(rows, binding);
  if (binding.sortField) {
    const field = binding.sortField;
    const dir = binding.sortDir === 'desc' ? -1 : 1;
    result = [...result].sort((a, b) => {
      const av = a?.[field];
      const bv = b?.[field];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      return av > bv ? dir : -dir;
    });
  }
  if (binding.limit) result = result.slice(0, binding.limit);
  return result;
}

export function aggregateRows(rows: any[], aggregate: 'count' | 'sum' | 'avg', field?: string): number {
  if (aggregate === 'count') return rows.length;
  const values = rows.map((row) => Number(row?.[field ?? ''])).filter((n) => Number.isFinite(n));
  if (!values.length) return 0;
  const total = values.reduce((sum, n) => sum + n, 0);
  return aggregate === 'sum' ? total : total / values.length;
}

export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}
