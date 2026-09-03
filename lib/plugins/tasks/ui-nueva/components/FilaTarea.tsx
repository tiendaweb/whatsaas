'use client';

import { Bot, CalendarDays, Check, Flag, GripVertical, IdCard, ListTree, Repeat } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { ChipProyecto } from './ChipProyecto';
import { esVencida, formatearFechaLarga } from '../data/fechas';
import { chipOrigen } from '../data/universo';
import { esActiva } from '../data/vistas';
import { ES } from '../i18n/es';
import type { Tarea } from '../data/tipos';
import { PRIO_COLORES } from '../data/tipos';

export function FilaTarea(props: {
  tarea: Tarea;
  mostrarOrigen: boolean;
  puedeArrastrar: boolean;
  seleccionable: boolean;
  seleccionada: boolean;
  onToggle: () => void;
  onPrepare?: () => void;
  onOpen: () => void;
  onDragStart?: (event: React.DragEvent, tarea: Tarea) => void;
  onDrop?: (event: React.DragEvent, tarea: Tarea, posicion: 'antes' | 'despues') => void;
  /** Dónde caería la tarea arrastrada respecto de ESTA fila. */
  indicador?: 'antes' | 'despues' | null;
  /** Esta fila es la que se está arrastrando. */
  arrastrandose?: boolean;
  onDragOverFila?: (tarea: Tarea, posicion: 'antes' | 'despues') => void;
  onDragEndFila?: () => void;
  clientes?: { id: number; name: string; tipo: 'cliente' | 'lead' }[];
  onAbrirCliente?: (id: number) => void;
  /** Un lead no tiene ficha de cliente propia: abre la ficha en modo lead. */
  onAbrirLead?: (contactId: number) => void;
  /** Otros tableros donde vive la misma tarea (tarea espejo). */
  espejos?: { projectId: number; projectName: string; workspaceName?: string | null }[];
  onAbrirProyecto?: (projectId: number) => void;
  onAbrirWorkspace?: (workspaceId: number) => void;
}) {
  const { tarea } = props;
  const done = tarea.status === 'done';
  const vencida = esVencida(tarea.dueDate, esActiva(tarea));
  const doneCount = tarea.subtareas.filter((s) => s.completed).length;
  const esRadar = isRadarTaskTitle(tarea.title);
  const enCola = Boolean(tarea.aiReadyAt);
  const puedePreparar = enCola || Boolean(
    tarea.aiPrompt.trim()
    || tarea.aiNextStep.trim()
    || tarea.aiContextQuestion.trim()
    || tarea.aiContextAnswer.trim(),
  );

  // El arrastre se habilita sólo mientras el puntero está sobre el asa. Si la
  // fila entera fuera `draggable` siempre, arrastrar desde cualquiera de sus
  // botones inicia una selección de texto en vez del arrastre — que era una de
  // las razones por las que "no se arrastraba bien".
  const [desdeAsa, setDesdeAsa] = useState(false);

  const posicionDelPuntero = (event: React.DragEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'antes' as const : 'despues' as const;
  };

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 px-3 py-3 rounded-2xl transition-all hover:bg-[var(--t-surface)]',
        props.seleccionada && 'bg-[color-mix(in_srgb,var(--tareas-accent)_5%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--tareas-accent)_30%,transparent)]',
        props.arrastrandose && 'opacity-40',
      )}
      draggable={props.puedeArrastrar && desdeAsa}
      onDragStart={(event) => {
        // Firefox no inicia el arrastre si no se declara algún dato.
        event.dataTransfer.setData('text/plain', String(tarea.id));
        event.dataTransfer.effectAllowed = 'move';
        props.onDragStart?.(event, tarea);
      }}
      onDragEnd={() => {
        setDesdeAsa(false);
        props.onDragEndFila?.();
      }}
      onDragOver={(event) => {
        if (!props.puedeArrastrar) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        props.onDragOverFila?.(tarea, posicionDelPuntero(event));
      }}
      onDrop={(event) => {
        event.preventDefault();
        props.onDrop?.(event, tarea, posicionDelPuntero(event));
      }}
    >
      {/* Referencia de dónde va a quedar: una línea en el borde donde caería. */}
      {props.indicador && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-[var(--tareas-accent)]',
            props.indicador === 'antes' ? '-top-px' : '-bottom-px',
          )}
        >
          <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-[var(--tareas-accent)]" />
        </span>
      )}

      {props.puedeArrastrar ? (
        <span
          onPointerDown={() => setDesdeAsa(true)}
          onPointerUp={() => setDesdeAsa(false)}
          className="shrink-0 cursor-grab text-neutral-300 transition-colors hover:text-[var(--tareas-accent)] active:cursor-grabbing"
          title={ES.cabecera.arrastrarParaOrdenar}
          aria-label={ES.cabecera.arrastrarParaOrdenar}
        >
          <GripVertical className="w-4 h-4" />
        </span>
      ) : (
        <span className="w-4 shrink-0" />
      )}

      <button
        type="button"
        onClick={props.onToggle}
        className={cn(
          'w-6 h-6 shrink-0 border-2 border-neutral-300 hover:border-[var(--tareas-accent)] transition-all flex items-center justify-center',
          props.seleccionable ? 'rounded-md' : 'rounded-full',
          done && !props.seleccionable && 'bg-[var(--tareas-accent)] border-[var(--tareas-accent)]',
          props.seleccionada && 'bg-[var(--tareas-accent)] border-[var(--tareas-accent)]',
        )}
        aria-label={done ? 'Descompletar' : 'Completar'}
      >
        {(done || props.seleccionada) && <Check className="w-3.5 h-3.5 text-white" />}
      </button>

      <button type="button" onClick={props.onOpen} className="flex-1 min-w-0 text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          {esRadar && <RadarTag size="xs" />}
          <span className={cn('min-w-0 truncate font-bold text-[15px] text-[var(--t-text)]', done && 'line-through text-[var(--t-muted)]')}>
            {radarTaskTitle(tarea.title)}
          </span>
        </div>
        <div className="mt-1 flex items-center flex-wrap gap-3 text-xs font-bold">
          {tarea.dueDate && (
            <span className={cn('inline-flex items-center gap-1', vencida ? 'text-rose-500' : 'text-[var(--t-muted)]')}>
              <CalendarDays className="w-3.5 h-3.5" />
              {formatearFechaLarga(tarea.dueDate)}
            </span>
          )}
          {tarea.subtareas.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[var(--t-muted)]">
              <ListTree className="w-3.5 h-3.5" />
              {doneCount}/{tarea.subtareas.length}
            </span>
          )}
          {tarea.etiquetas.map((etiqueta) => (
            <span key={etiqueta.id} className="inline-flex items-center gap-1 text-[var(--t-muted)]">
              <span className="w-2 h-2 rounded-full" style={{ background: etiqueta.color }} />
              {etiqueta.name}
            </span>
          ))}
          {tarea.recurrencia !== 'unica' && (
            <Repeat className="w-3.5 h-3.5 text-[var(--t-muted)]" />
          )}
          {tarea.prioridad === 'alta' && (
            <Flag className="w-3.5 h-3.5" style={{ color: PRIO_COLORES.alta }} />
          )}
          {(props.clientes ?? []).map((parte) => (
            <button
              key={`${parte.tipo}-${parte.id}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (parte.tipo === 'cliente') props.onAbrirCliente?.(parte.id);
                else props.onAbrirLead?.(parte.id);
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2 py-0.5',
                parte.tipo === 'cliente'
                  ? 'bg-[color-mix(in_srgb,var(--tareas-accent)_12%,transparent)] text-[var(--tareas-accent)]'
                  : 'bg-[var(--t-surface-2)] text-[var(--t-text-secondary)]',
              )}
            >
              <IdCard className="w-3.5 h-3.5" />
              {parte.tipo === 'cliente' ? ES.relaciones.fichaCorta : ES.relaciones.leadCorto} · {parte.name}
            </button>
          ))}
          {props.mostrarOrigen && (
            <ChipProyecto
              workspaceNombre={tarea.workspaceNombre || null}
              proyectoNombre={tarea.proyectoNombre}
              espejos={props.espejos}
              onAbrirWorkspace={tarea.workspaceId && props.onAbrirWorkspace ? () => props.onAbrirWorkspace!(tarea.workspaceId!) : undefined}
              onAbrirProyecto={props.onAbrirProyecto ? () => props.onAbrirProyecto!(tarea.projectId) : undefined}
              onAbrirEspejo={props.onAbrirProyecto}
            />
          )}
        </div>
      </button>
      {!done && !props.seleccionable ? (
        <button
          type="button"
          onClick={props.onPrepare}
          disabled={!puedePreparar}
          title={enCola ? ES.ia.quitarDeCola : puedePreparar ? ES.ia.preparar : ES.ia.prepararSinPrompt}
          aria-label={enCola ? ES.ia.quitarDeCola : puedePreparar ? ES.ia.preparar : ES.ia.prepararSinPrompt}
          aria-pressed={enCola}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all',
            enCola
              ? 'border-[var(--tareas-accent)] bg-[color-mix(in_srgb,var(--tareas-accent)_15%,transparent)] text-[var(--tareas-accent)]'
              : puedePreparar
                ? 'border-[color-mix(in_srgb,var(--tareas-accent)_35%,var(--t-border))] text-[var(--tareas-accent)] hover:bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)]'
                : 'cursor-not-allowed border-[var(--t-border)] text-[var(--t-muted)] opacity-40',
          )}
        >
          <Bot className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
