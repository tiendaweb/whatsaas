'use client';

import { useRef, useState } from 'react';
import { Bot, CalendarDays, Check, Flag, ListTree, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { C } from '../data/clases';
import { esVencida, formatearFechaCorta } from '../data/fechas';
import { esActiva } from '../data/vistas';
import { PRIO_COLORES, type Tarea } from '../data/tipos';
import type { TaskProject } from '@/lib/plugins/tasks/client/types';
import { ES } from '../i18n/es';

export function Tablero(props: {
  proyecto: TaskProject;
  tareas: Tarea[];
  onOpen: (tarea: Tarea) => void;
  onToggle: (tarea: Tarea) => void;
  onPrepare?: (tarea: Tarea) => void;
  onCreateTask: (columnId: number, title: string) => Promise<unknown>;
  onCreateColumn: (title: string) => Promise<unknown>;
  onDropTask: (tareaId: number, columnId: number, beforeId?: number) => void;
}) {
  const byCol = new Map<number, Tarea[]>();
  for (const tarea of props.tareas) {
    const list = byCol.get(tarea.columnId) ?? [];
    list.push(tarea);
    byCol.set(tarea.columnId, list);
  }
  for (const list of byCol.values()) list.sort((a, b) => a.order - b.order);

  const dragId = useRef<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [newCol, setNewCol] = useState('');

  const columns = [...props.proyecto.columns].sort((a, b) => a.order - b.order);

  return (
    <div className="flex gap-4 overflow-x-auto pb-32 -mx-6 px-6">
      {columns.map((columna) => {
        const items = byCol.get(columna.id) ?? [];
        return (
          <div
            key={columna.id}
            className="w-80 shrink-0 bg-[var(--t-surface)] rounded-3xl p-4 flex flex-col gap-3 max-h-[calc(100vh-16rem)]"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragId.current) props.onDropTask(dragId.current, columna.id);
              dragId.current = null;
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={C.rotulo}>{columna.title}</span>
                <span className={C.badge}>{items.length}</span>
              </div>
            </div>
            <div className="space-y-2 overflow-y-auto min-h-0 flex-1">
              {items.map((tarea) => {
                const done = tarea.status === 'done';
                const vencida = esVencida(tarea.dueDate, esActiva(tarea));
                const doneCount = tarea.subtareas.filter((s) => s.completed).length;
                return (
                  <div
                    key={tarea.id}
                    draggable
                    onDragStart={(event) => {
                      dragId.current = tarea.id;
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (dragId.current) props.onDropTask(dragId.current, columna.id, tarea.id);
                      dragId.current = null;
                    }}
                    className="bg-[var(--t-surface-2)] rounded-2xl p-4 space-y-2 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => props.onOpen(tarea)}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onToggle(tarea);
                        }}
                        className={cn(
                          'w-5 h-5 mt-0.5 shrink-0 rounded-full border-2 border-neutral-300 flex items-center justify-center',
                          done && 'bg-[var(--tareas-accent)] border-[var(--tareas-accent)]',
                        )}
                      >
                        {done && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <p className={cn('min-w-0 font-bold text-sm text-[var(--t-text)]', done && 'line-through text-[var(--t-muted)]')}>
                        {isRadarTaskTitle(tarea.title) && <RadarTag size="xs" className="mr-1" />}
                        {radarTaskTitle(tarea.title)}
                      </p>
                      {!done ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            props.onPrepare?.(tarea);
                          }}
                          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--tareas-accent)_35%,var(--t-border))] text-[var(--tareas-accent)] hover:bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)]"
                          title={ES.ia.preparar}
                          aria-label={ES.ia.preparar}
                        >
                          <Bot className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <div className="flex items-center flex-wrap gap-2 text-xs font-bold text-[var(--t-muted)] pl-8">
                      {tarea.dueDate && (
                        <span className={cn('inline-flex items-center gap-1', vencida && 'text-rose-500')}>
                          <CalendarDays className="w-3 h-3" />
                          {formatearFechaCorta(tarea.dueDate)}
                        </span>
                      )}
                      {tarea.subtareas.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ListTree className="w-3 h-3" />
                          {doneCount}/{tarea.subtareas.length}
                        </span>
                      )}
                      {tarea.recurrencia !== 'unica' && <Repeat className="w-3 h-3" />}
                      {tarea.prioridad === 'alta' && <Flag className="w-3 h-3" style={{ color: PRIO_COLORES.alta }} />}
                    </div>
                  </div>
                );
              })}
            </div>
            <input
              value={drafts[columna.id] ?? ''}
              onChange={(event) => setDrafts((prev) => ({ ...prev, [columna.id]: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return;
                event.preventDefault();
                const title = (drafts[columna.id] ?? '').trim();
                if (!title) return;
                void props.onCreateTask(columna.id, title);
                setDrafts((prev) => ({ ...prev, [columna.id]: '' }));
              }}
              placeholder={ES.captura.tablero}
              className="w-full rounded-2xl bg-[var(--t-surface-2)] px-4 py-3 text-sm outline-none text-[var(--t-text)] placeholder:text-[var(--t-muted)]"
            />
          </div>
        );
      })}
      <div className="w-80 shrink-0">
        <input
          value={newCol}
          onChange={(event) => setNewCol(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            if (!newCol.trim()) return;
            void props.onCreateColumn(newCol.trim());
            setNewCol('');
          }}
          placeholder={ES.tablero.nombreColumna}
          className="w-full h-32 rounded-3xl bg-[var(--t-surface)] border border-[var(--t-border)] px-4 text-sm outline-none text-[var(--t-text)] placeholder:text-[var(--t-muted)]"
        />
      </div>
    </div>
  );
}
