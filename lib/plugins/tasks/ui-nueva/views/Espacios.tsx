'use client';

import { X } from 'lucide-react';
import type { MiembroFiltro } from '../data/miembros';
import type { Tarea } from '../data/tipos';
import { ES } from '../i18n/es';
import { IconosEspacios, type EspacioIcono } from '../layout/IconosEspacios';
import { ListaEsperandoPago, type ClienteIcono, type ClientePendiente } from '../layout/ListaClientes';
import { VistaColumnasMiembros } from './VistaColumnasMiembros';

export type { EspacioIcono };

export function Espacios(props: {
  espacios: EspacioIcono[];
  activoId: number | null;
  onElegir: (id: number | null) => void;
  onCerrar: () => void;
  tareas: Tarea[];
  miembros: MiembroFiltro[];
  destacadoId?: number | null;
  onToggle: (tarea: Tarea) => void;
  onPrepare?: (tarea: Tarea) => void;
  onOpen: (tarea: Tarea) => void;
  onToggleSub?: (tarea: Tarea, index: number) => void;
  onAbrirCliente?: (id: number) => void;
  /** Un lead no tiene ficha de cliente propia: abre la ficha en modo lead. */
  onAbrirLead?: (contactId: number) => void;
  clientesPorTarea?: Record<number, { id: number; name: string; tipo: 'cliente' | 'lead' }[]>;
  onAsignar?: (tarea: Tarea, miembroId: number) => void;
  clientesRecientes?: ClienteIcono[];
  clientesEsperandoPago?: ClientePendiente[];
  clienteActivoId?: number | null;
  onElegirCliente?: (id: number | null) => void;
}) {
  return (
    <div className="relative min-h-full">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 18% 8%, rgba(99,102,241,.45) 0%, transparent 52%), radial-gradient(ellipse at 88% 92%, rgba(14,165,233,.38) 0%, transparent 48%), linear-gradient(165deg, #0f172a 0%, #1e1b4b 48%, #0b1224 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.8\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'160\' height=\'160\' filter=\'url(%23n)\' opacity=\'.35\'/%3E%3C/svg%3E")',
        }}
      />

      <div className="relative z-10 px-6 py-8 lg:px-10 min-h-full pb-16">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-white">{ES.nav.espaciosTitulo}</h1>
            <p className="text-white/60 mt-1">{ES.nav.espaciosBajada}</p>
          </div>
          <button
            type="button"
            onClick={props.onCerrar}
            className="w-12 h-12 rounded-full bg-white/10 text-white/80 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label={ES.modal.cerrar}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <IconosEspacios
          espacios={props.espacios}
          activoId={props.activoId}
          onElegir={props.onElegir}
          variant="os"
        />

        {/* Entre los iconos de espacios y las columnas del equipo: primero
            con quién se trabaja (clientes), después quién lo hace. */}
        {/* La lista de clientes recientes se sacó: duplicaba el sidebar y
            tapaba las columnas del equipo. Queda sólo lo que espera un pago. */}
        {props.onElegirCliente && (
          <>
            <ListaEsperandoPago
              clientes={props.clientesEsperandoPago ?? []}
              activoId={props.clienteActivoId ?? null}
              onElegir={props.onElegirCliente}
            />
          </>
        )}

        <section className="mt-10">
          {/* El fondo de este bloque es siempre el gradiente oscuro de arriba, sea cual sea el
              tema claro/oscuro de WhatsPro — por eso el rótulo va con blanco fijo y no con
              `C.rotulo` (que usa `--t-muted`, pensado para texto sobre una superficie con tema). */}
          <div className="text-[10px] uppercase font-black tracking-[0.2em] text-white/50 mb-4">{ES.dashboard.columnas}</div>
          <VistaColumnasMiembros
            modo="dashboard"
            tareas={props.tareas}
            miembros={props.miembros}
            destacadoId={props.destacadoId}
            onToggle={props.onToggle}
            onPrepare={props.onPrepare}
            onOpen={props.onOpen}
            onToggleSub={props.onToggleSub}
            onAbrirCliente={props.onAbrirCliente}
            onAbrirLead={props.onAbrirLead}
            clientesPorTarea={props.clientesPorTarea}
            onAsignar={props.onAsignar}
          />
        </section>
      </div>
    </div>
  );
}
