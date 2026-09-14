'use client';

import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function CargandoBloques({ bloques = 6, className }: { bloques?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: bloques }).map((_, i) => (
        <Skeleton key={i} className="h-[92px] rounded-2xl" />
      ))}
    </div>
  );
}

export function VacioEstado({ titulo, ayuda, className }: { titulo: string; ayuda?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center', className)}>
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      {ayuda && <p className="text-[11px] text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

export function ErrorEstado({ mensaje, onReintentar, className }: { mensaje?: string; onReintentar?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center', className)} role="alert">
      <AlertCircle className="size-6 text-destructive" aria-hidden />
      <p className="text-sm font-medium text-foreground">No se pudo cargar</p>
      {mensaje && <p className="text-xs text-muted-foreground">{mensaje}</p>}
      {onReintentar && (
        <Button variant="outline" size="sm" onClick={onReintentar} className="mt-1">
          <RefreshCw className="size-3.5" aria-hidden /> Reintentar
        </Button>
      )}
    </div>
  );
}

/**
 * Límite de error por vista.
 *
 * Las vistas de Empresa montan las pantallas de OTRAS apps (Planes es la
 * sección de Membresías, Ventas es el tablero de Ventas). Sin esto, un error
 * adentro de cualquiera de ellas se lleva puesto el shell entero y la persona
 * pierde hasta el menú para irse a otro lado.
 */
export { LimiteDeError } from './LimiteDeError';
