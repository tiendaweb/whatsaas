'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Owner } from '../../shared/taxonomy';

export type OwnerFilterValue = 'todos' | Extract<Owner, 'noelia' | 'carlos' | 'produccion'>;
export const OWNER_FILTER_VALUES: OwnerFilterValue[] = ['todos', 'noelia', 'carlos', 'produccion'];
const LABELS: Record<OwnerFilterValue, string> = { todos: 'Todos', noelia: 'Noelia', carlos: 'Carlos', produccion: 'Producción' };

export function isOwnerFilterValue(v: unknown): v is OwnerFilterValue {
  return typeof v === 'string' && (OWNER_FILTER_VALUES as string[]).includes(v);
}

/** Filtro global "Responsable". Persiste en localStorage (lo maneja el shell). */
export function OwnerFilter({ value, onChange }: { value: OwnerFilterValue; onChange: (v: OwnerFilterValue) => void }) {
  return (
    <Select value={value} onValueChange={(v) => isOwnerFilterValue(v) && onChange(v)}>
      <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Responsable">
        <span className="text-muted-foreground">Responsable:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OWNER_FILTER_VALUES.map((v) => (
          <SelectItem key={v} value={v} className="text-xs">
            {LABELS[v]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
