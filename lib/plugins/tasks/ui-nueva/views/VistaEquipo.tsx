'use client';

import { Bot, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { ChipProyecto } from '../components/ChipProyecto';
import { EstadoVacio } from '../components/EstadoVacio';
import { C } from '../data/clases';
import { esVencida, formatearFechaLarga } from '../data/fechas';
import { chipOrigen } from '../data/universo';
import { esActiva } from '../data/vistas';
import { ES } from '../i18n/es';
import type { Tarea } from '../data/tipos';

export function VistaEquipo(props: {
  tareas: Tarea[];
  onToggle: (tarea: Tarea) => void;
  onPrepare?: (tarea: Tarea) => void;
  onOpen: (tarea: Tarea) => void;
  onToggleSub: (tarea: Tarea, index: number) => void;
  onAbrirCliente?: (id: number) => void;
  onAbrirLead?: (contactId: number) => void;
  clientesPorTarea?: Record<number, { id: number; name: string; tipo: 'cliente' | 'lead' }[]>;
}) {
  if (props.tareas.length === 0) {
    return <EstadoVacio titulo={ES.vacio.titulo} detalle={ES.equipo.vacio} />;
  }

  return (
    <div className="space-y-3 pb-32">
      {props.tareas.map((tarea) => {
        const done = tarea.status === 'done';
        const vencida = esVencida(tarea.dueDate, esActiva(tarea));
        const clientes = props.clientesPorTarea?.[tarea.id] ?? [];
        return (
          <article key={tarea.id} className={cn(C.card, 'p-4')}>
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => props.onToggle(tarea)}
                className={cn(
                  'mt-0.5 w-6 h-6 shrink-0 rounded-full border-2 border-neutral-300 hover:border-[var(--tareas-accent)] transition-all flex items-center justify-center',
                  done && 'bg-[var(--tareas-accent)] border-[var(--tareas-accent)]',
                )}
                aria-label={done ? 'Descompletar' : 'Completar'}
              >
                {done && <Check className="w-3.5 h-3.5 text-white" />}
              </button>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => props.onOpen(tarea)}
                  className={cn(
                    'flex min-w-0 items-center gap-1.5 text-left font-bold text-[15px] text-[var(--t-text)]',
                    done && 'line-through text-[var(--t-muted)]',
                  )}
                >
                  {isRadarTaskTitle(tarea.title) && <RadarTag size="xs" />}
                  <span className="min-w-0 break-words">{radarTaskTitle(tarea.title)}</span>
                </button>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <ChipProyecto workspaceNombre={tarea.workspaceNombre || null} proyectoNombre={tarea.proyectoNombre} />
                  {tarea.dueDate && (
                    <span className={cn('text-[11px] font-bold', vencida ? 'text-rose-500' : 'text-[var(--t-muted)]')}>
                      {formatearFechaLarga(tarea.dueDate)}
                    </span>
                  )}
                  {tarea.etiquetas.map((etiqueta) => (
                    <span key={etiqueta.id} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--t-muted)]">
                      <span className="w-2 h-2 rounded-full" style={{ background: etiqueta.color }} />
                      {etiqueta.name}
                    </span>
                  ))}
                  {clientes.map((cliente) => (
                    <button
                      key={cliente.id}
                      type="button"
                      onClick={() => props.onAbrirCliente?.(cliente.id)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold bg-[color-mix(in_srgb,var(--tareas-accent)_12%,transparent)] text-[var(--tareas-accent)]"
                    >
                      {ES.relaciones.fichaCorta} · {cliente.name}
                    </button>
                  ))}
                </div>
                {tarea.subtareas.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {tarea.subtareas.map((paso, index) => (
                      <li key={paso.id}>
                        <button
                          type="button"
                          onClick={() => props.onToggleSub(tarea, index)}
                          className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-[var(--t-hover)]"
                        >
                          <span
                            className={cn(
                              'w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center',
                              paso.completed
                                ? 'bg-[var(--tareas-accent)] border-[var(--tareas-accent)]'
                                : 'border-neutral-300',
                            )}
                          >
                            {paso.completed && <Check className="w-2.5 h-2.5 text-white" />}
                          </span>
                          <span className={cn('text-sm', paso.completed ? 'line-through text-[var(--t-muted)]' : 'text-[var(--t-text)]')}>
                            {paso.text}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {!done ? (
                <button
                  type="button"
                  onClick={() => props.onPrepare?.(tarea)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--tareas-accent)_35%,var(--t-border))] text-[var(--tareas-accent)] hover:bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)]"
                  title={ES.ia.preparar}
                  aria-label={ES.ia.preparar}
                >
                  <Bot className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
