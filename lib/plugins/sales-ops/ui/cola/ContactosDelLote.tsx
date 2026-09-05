'use client';

import useSWR from 'swr';
import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueueBatchPayload } from '../../shared/api-types';
import { ErrorState } from '../components/States';
import { fmtInt } from '../components/format';
import { QUEUE_ENDPOINT, STATUS_LABELS, fetcher } from './api';

/**
 * A quién le va a salir este lote, para poder abrir su chat.
 *
 * Un lote no cuelga de un chat: toca veinte a la vez. Por eso el panel del
 * contacto quedaba vacío justo en el ítem donde más falta hace mirar la
 * conversación —aprobar un envío a veinte personas sin ver ninguna es
 * exactamente lo que la supervisión vino a evitar—. Acá se elige de cuál.
 *
 * Comparte la clave SWR con "Revisar lote": abrir el detalle después no vuelve
 * a pedir nada.
 */
export function ContactosDelLote({
  batchId,
  seleccionado,
  onElegir,
  className,
}: {
  batchId: string;
  seleccionado: number | null;
  onElegir: (chatId: number, nombre: string) => void;
  className?: string;
}) {
  const { data, error, isLoading, mutate } = useSWR<QueueBatchPayload>(`${QUEUE_ENDPOINT}/${encodeURIComponent(batchId)}`, fetcher, { revalidateOnFocus: false });

  if (error) return <ErrorState className={className} message={error instanceof Error ? error.message : undefined} onRetry={() => void mutate()} />;
  if (isLoading || !data) {
    return (
      <div className={cn('flex items-center justify-center py-8 text-muted-foreground', className)}>
        <Loader2 className="size-4 animate-spin" aria-hidden />
      </div>
    );
  }

  const filas = data.actions;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <p className="shrink-0 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {fmtInt(filas.length)} {filas.length === 1 ? 'contacto' : 'contactos'} del lote
      </p>
      {filas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Este lote ya no tiene acciones.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
          {filas.map((accion) => {
            const activa = seleccionado === accion.chatId;
            return (
              <li key={accion.id}>
                <button
                  type="button"
                  onClick={() => onElegir(accion.chatId, accion.name)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
                    activa ? 'border-violet-500 bg-violet-500/10' : 'border-border hover:bg-muted/60',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{accion.name}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {STATUS_LABELS[accion.status] ?? accion.status}
                      {accion.warnings.length > 0 && ` · ${accion.warnings.length} aviso${accion.warnings.length === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
