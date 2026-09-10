'use client';

import { Ban, Check, Clock, Layers, MessageSquareText, SkipForward, Wand2, Wrench, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tiempoRelativo } from '../components/format';
import type { ItemSupervision } from './FocusCola';

const ICONO: Record<ItemSupervision['tipo'], LucideIcon> = {
  lote: Layers,
  indicacion: MessageSquareText,
  prompt: Wand2,
  programado: Clock,
  crm: Wrench,
};

/**
 * Cómo quedó cada ítem en esta sesión de supervisión.
 *
 * `supervisado` es "lo miré y está bien" —o le toqué algo que no decide nada,
 * como pausar o corregir un programado—: cuenta como revisado pero NO como
 * aprobado. Antes cualquier cambio marcaba "aprobado" y el tilde verde mentía.
 */
export type EstadoRevision = 'aprobado' | 'descartado' | 'supervisado' | 'saltado';

/**
 * La cola entera a la izquierda, no de a uno.
 *
 * Recorrer con las flechas está bien cuando se va en orden, pero para saber qué
 * hay —cuántos pre-descartes, si quedó un lote sin aprobar— había que pasar por
 * todos. Acá se ve la lista completa y se salta a cualquiera de un clic, sin
 * perder el progreso ni el bloque.
 *
 * Lo resuelto queda tachado en vez de desaparecer: ver bajar la lista es la
 * mitad de la sensación de avance, y además deja volver a algo que se aprobó
 * hace dos minutos.
 */
export function ColaLateral({
  items,
  indice,
  resueltos,
  onElegir,
  className,
}: {
  items: ItemSupervision[];
  indice: number;
  resueltos: Record<string, EstadoRevision>;
  onElegir: (indice: number) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <p className="shrink-0 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Por revisar</p>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
        {items.map((item, i) => {
          const Icon = ICONO[item.tipo];
          const estado = resueltos[item.key];
          const activo = i === indice;
          const hecho = estado && estado !== 'saltado';
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onElegir(i)}
                aria-current={activo ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
                  activo ? 'border-violet-500 bg-violet-500/10' : 'border-transparent hover:bg-muted/60',
                  hecho && !activo && 'opacity-45',
                )}
              >
                <Icon className={cn('size-3.5 shrink-0', activo ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-xs font-medium', hecho && 'line-through')}>{titulo(item)}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {subtitulo(item)} · {tiempoRelativo(item.fecha)}
                  </span>
                </span>
                {/* Verde sólo lo aprobado; lo supervisado lleva un tilde neutro
                    y lo descartado una prohibición: el color dice qué se decidió. */}
                {estado === 'aprobado' && <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />}
                {estado === 'supervisado' && <Check className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                {estado === 'descartado' && <Ban className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                {estado === 'saltado' && <SkipForward className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function titulo(item: ItemSupervision): string {
  if (item.tipo === 'lote') return item.batch.batchLabel;
  if (item.tipo === 'programado') return item.programado.name;
  if (item.tipo === 'crm') return item.crm.name;
  return item.run.title;
}

/** Qué es y en qué estado, en tres palabras: es lo que decide si vale entrar. */
function subtitulo(item: ItemSupervision): string {
  if (item.tipo === 'lote') {
    const pendientes = (item.batch.byStatus.proposed ?? 0) + (item.batch.byStatus.pending_approval ?? 0);
    return pendientes > 0 ? `${pendientes} sin aprobar` : `${item.batch.total} acciones`;
  }
  if (item.tipo === 'programado') return item.programado.status === 'failed' ? 'falló' : 'pausado';
  if (item.tipo === 'crm') return 'corregir CRM';
  if (item.run.status === 'blocked') return 'necesita tu criterio';
  if (item.run.status === 'failed') return 'falló';
  return item.run.targetName ?? 'sin aprobar';
}
