'use client';

import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarcaResumen } from '../../shared/api-types';

/**
 * Filtro global por marca. Vive en el rail y en la cabecera móvil, igual que
 * el filtro de responsable del Command Center.
 *
 * Es un `<select>` nativo a propósito: la lista de marcas la escribe el equipo
 * y puede tener veinte entradas; el desplegable del sistema se busca tipeando y
 * en el celular abre la rueda nativa.
 */
export function MarcaFilter({
  marcas,
  value,
  onChange,
  className,
}: {
  marcas: MarcaResumen[];
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
}) {
  return (
    <label className={cn('flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5', className)}>
      <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">Marca</span>
      <select
        value={value ?? ''}
        onChange={(event) => {
          const raw = Number(event.target.value);
          onChange(Number.isInteger(raw) && raw > 0 ? raw : null);
        }}
        className="min-w-0 flex-1 bg-transparent text-xs font-medium text-foreground outline-none"
      >
        <option value="">Todas las marcas</option>
        {marcas.map((marca) => (
          <option key={marca.id} value={marca.id}>
            {marca.name}
          </option>
        ))}
      </select>
    </label>
  );
}
