'use client';

import { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EstadoVacio } from './EstadoVacio';
import { FilaTarea } from './FilaTarea';
import { C } from '../data/clases';
import type { GrupoFecha } from '../data/vistas';
import type { Tarea } from '../data/tipos';


type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'task'; key: string; tarea: Tarea };

export function ListaTareas(props: {
  grupos: GrupoFecha[] | null;
  tareas: Tarea[];
  mostrarOrigen: boolean;
  puedeArrastrar: boolean;
  seleccionable: boolean;
  seleccion: Set<number>;
  vacioTitulo?: string;
  vacioDetalle?: string;
  onToggle: (tarea: Tarea) => void;
  onPrepare?: (tarea: Tarea) => void;
  onOpen: (tarea: Tarea) => void;
  onReorder?: (fromId: number, toId: number, posicion: 'antes' | 'despues') => void;
  clientesPorTarea?: Record<number, { id: number; name: string; tipo: 'cliente' | 'lead' }[]>;
  onAbrirCliente?: (id: number) => void;
  /** Un lead no tiene ficha de cliente propia: abre la ficha en modo lead. */
  onAbrirLead?: (contactId: number) => void;
  onAbrirProyecto?: (projectId: number) => void;
  onAbrirWorkspace?: (workspaceId: number) => void;
}) {
  const rows: Row[] = props.grupos
    ? props.grupos.flatMap((grupo) => [
        { kind: 'header' as const, key: `h-${grupo.clave}`, label: grupo.label },
        ...grupo.tareas.map((tarea) => ({ kind: 'task' as const, key: `t-${tarea.id}`, tarea })),
      ])
    : props.tareas.map((tarea) => ({ kind: 'task' as const, key: `t-${tarea.id}`, tarea }));

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualize = rows.length > 200;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.kind === 'header' ? 36 : 76),
    overscan: 10,
    enabled: virtualize,
  });

  const dragId = useRef<number | null>(null);
  // Fila sobre la que está el puntero y de qué lado caería: alimenta la línea
  // de referencia que se dibuja en FilaTarea.
  const [destino, setDestino] = useState<{ id: number; posicion: 'antes' | 'despues' } | null>(null);
  const [arrastrandoId, setArrastrandoId] = useState<number | null>(null);

  const limpiarArrastre = () => {
    dragId.current = null;
    setDestino(null);
    setArrastrandoId(null);
  };

  if (rows.length === 0) {
    return <EstadoVacio titulo={props.vacioTitulo} detalle={props.vacioDetalle} />;
  }

  const renderRow = (row: Row) => {
    if (row.kind === 'header') {
      return (
        <div key={row.key} className={`${C.rotulo} pt-2`}>
          {row.label}
        </div>
      );
    }
    return (
      <FilaTarea
        key={row.key}
        tarea={row.tarea}
        mostrarOrigen={props.mostrarOrigen}
        puedeArrastrar={props.puedeArrastrar}
        seleccionable={props.seleccionable}
        seleccionada={props.seleccion.has(row.tarea.id)}
        onToggle={() => props.onToggle(row.tarea)}
        onPrepare={() => props.onPrepare?.(row.tarea)}
        onOpen={() => props.onOpen(row.tarea)}
        clientes={props.clientesPorTarea?.[row.tarea.id]}
        onAbrirCliente={props.onAbrirCliente}
        onAbrirLead={props.onAbrirLead}
        onAbrirProyecto={props.onAbrirProyecto}
        onAbrirWorkspace={props.onAbrirWorkspace}
        espejos={row.tarea.espejos}
        indicador={destino?.id === row.tarea.id ? destino.posicion : null}
        arrastrandose={arrastrandoId === row.tarea.id}
        onDragOverFila={(tarea, posicion) => {
          if (dragId.current && dragId.current !== tarea.id) setDestino({ id: tarea.id, posicion });
        }}
        onDragEndFila={limpiarArrastre}
        onDragStart={(event, tarea) => {
          dragId.current = tarea.id;
          setArrastrandoId(tarea.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onDrop={(event, tarea, posicion) => {
          event.preventDefault();
          if (dragId.current && dragId.current !== tarea.id) {
            props.onReorder?.(dragId.current, tarea.id, posicion);
          }
          limpiarArrastre();
        }}
      />
    );
  };

  if (!virtualize) {
    if (props.grupos) {
      return (
        <div className="space-y-8 pb-32">
          {props.grupos.map((grupo) => (
            <div key={grupo.clave} className="space-y-4">
              <div className={C.rotulo}>{grupo.label}</div>
              <div className="space-y-4">
                {grupo.tareas.map((tarea) => (
                  <FilaTarea
                    key={tarea.id}
                    tarea={tarea}
                    mostrarOrigen={props.mostrarOrigen}
                    puedeArrastrar={props.puedeArrastrar}
                    seleccionable={props.seleccionable}
                    seleccionada={props.seleccion.has(tarea.id)}
                    onToggle={() => props.onToggle(tarea)}
                    onPrepare={() => props.onPrepare?.(tarea)}
                    onOpen={() => props.onOpen(tarea)}
                    clientes={props.clientesPorTarea?.[tarea.id]}
                    onAbrirCliente={props.onAbrirCliente}
                    onAbrirLead={props.onAbrirLead}
                    onAbrirProyecto={props.onAbrirProyecto}
                    onAbrirWorkspace={props.onAbrirWorkspace}
                    espejos={tarea.espejos}
                    indicador={destino?.id === tarea.id ? destino.posicion : null}
                    arrastrandose={arrastrandoId === tarea.id}
                    onDragOverFila={(item, posicion) => {
                      if (dragId.current && dragId.current !== item.id) setDestino({ id: item.id, posicion });
                    }}
                    onDragEndFila={limpiarArrastre}
                    onDragStart={(event, item) => {
                      dragId.current = item.id;
                      setArrastrandoId(item.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDrop={(event, item, posicion) => {
                      event.preventDefault();
                      if (dragId.current && dragId.current !== item.id) {
                        props.onReorder?.(dragId.current, item.id, posicion);
                      }
                      limpiarArrastre();
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-4 pb-32">
        {props.tareas.map((tarea) => (
          <FilaTarea
            key={tarea.id}
            tarea={tarea}
            mostrarOrigen={props.mostrarOrigen}
            puedeArrastrar={props.puedeArrastrar}
            seleccionable={props.seleccionable}
            seleccionada={props.seleccion.has(tarea.id)}
            onToggle={() => props.onToggle(tarea)}
            onPrepare={() => props.onPrepare?.(tarea)}
            onOpen={() => props.onOpen(tarea)}
            clientes={props.clientesPorTarea?.[tarea.id]}
            onAbrirCliente={props.onAbrirCliente}
            onAbrirLead={props.onAbrirLead}
            onAbrirProyecto={props.onAbrirProyecto}
            onAbrirWorkspace={props.onAbrirWorkspace}
            espejos={tarea.espejos}
        
            indicador={destino?.id === tarea.id ? destino.posicion : null}
            arrastrandose={arrastrandoId === tarea.id}
            onDragOverFila={(item, posicion) => {
              if (dragId.current && dragId.current !== item.id) setDestino({ id: item.id, posicion });
            }}
            onDragEndFila={limpiarArrastre}
            onDragStart={(event, item) => {
              dragId.current = item.id;
              setArrastrandoId(item.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDrop={(event, item, posicion) => {
              event.preventDefault();
              if (dragId.current && dragId.current !== item.id) {
                props.onReorder?.(dragId.current, item.id, posicion);
              }
              limpiarArrastre();
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="pb-32 max-h-[70vh] overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={row.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderRow(row)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
