'use client';

import { useRef, useState } from 'react';
import { Bot, CalendarDays, Check, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { ChipProyecto } from '../components/ChipProyecto';
import { C } from '../data/clases';
import { esVencida, formatearFechaCorta } from '../data/fechas';
import { agruparPorColumnasMiembro, tareasSinAsignar } from '../data/miembros';
import { chipOrigen } from '../data/universo';
import { esActiva } from '../data/vistas';
import type { MiembroFiltro } from '../layout/FiltroMiembros';
import { ES } from '../i18n/es';
import { PRIO_COLORES, PRIO_LABELS, type Tarea } from '../data/tipos';

type TarjetaProps = {
  tarea: Tarea;
  onDragStart: (tarea: Tarea) => void;
  onDragEnd?: () => void;
  onToggle: (tarea: Tarea) => void;
  onPrepare?: (tarea: Tarea) => void;
  onOpen: (tarea: Tarea) => void;
  onToggleSub?: (tarea: Tarea, index: number) => void;
  onAbrirCliente?: (id: number) => void;
  /** Un lead no tiene ficha de cliente propia: abre la ficha en modo lead. */
  onAbrirLead?: (contactId: number) => void;
  clientesPorTarea?: Record<number, { id: number; name: string; tipo: 'cliente' | 'lead' }[]>;
};

function TarjetaMiembro({ tarea, onDragStart, onDragEnd, onToggle, onPrepare, onOpen, onToggleSub, onAbrirCliente, onAbrirLead, clientesPorTarea }: TarjetaProps) {
  const done = tarea.status === 'done';
  const vencida = esVencida(tarea.dueDate, esActiva(tarea));
  const clientes = clientesPorTarea?.[tarea.id] ?? [];
  // Fondo negro transparente: la tarjeta se apoya en el gradiente de la
  // pantalla en vez de taparlo con una superficie opaca.
  return (
    <article
      draggable
      onDragEnd={() => onDragEnd?.()}
      onDragStart={(event) => {
        onDragStart(tarea);
        // Firefox no arranca el arrastre sin datos declarados.
        event.dataTransfer.setData('text/plain', String(tarea.id));
        event.dataTransfer.effectAllowed = 'move';
      }}
      className="bg-black/20 hover:bg-black/30 rounded-2xl p-3 space-y-2 cursor-grab active:cursor-grabbing transition-colors"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onToggle(tarea)}
          className={cn(
            'w-5 h-5 mt-0.5 shrink-0 rounded-full border-2 border-neutral-300 flex items-center justify-center',
            done && 'bg-[var(--tareas-accent)] border-[var(--tareas-accent)]',
          )}
          aria-label={done ? 'Descompletar' : 'Completar'}
        >
          {done && <Check className="w-3 h-3 text-white" />}
        </button>
        {!done ? (
          <button
            type="button"
            onClick={() => onPrepare?.(tarea)}
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 text-[var(--tareas-accent)] hover:bg-white/10"
            title={ES.ia.preparar}
            aria-label={ES.ia.preparar}
          >
            <Bot className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onOpen(tarea)}
          className={cn(
            'flex flex-1 min-w-0 items-center gap-1.5 text-left font-bold text-sm text-[var(--t-text)]',
            done && 'line-through text-[var(--t-muted)]',
          )}
        >
          {isRadarTaskTitle(tarea.title) && <RadarTag size="xs" />}
          <span className="min-w-0 break-words">{radarTaskTitle(tarea.title)}</span>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-7">
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
          style={{
            color: PRIO_COLORES[tarea.prioridad],
            background: `color-mix(in srgb, ${PRIO_COLORES[tarea.prioridad]} 16%, transparent)`,
          }}
        >
          <Flag className="w-3 h-3" />
          {PRIO_LABELS[tarea.prioridad].name}
        </span>
        <ChipProyecto workspaceNombre={tarea.workspaceNombre || null} proyectoNombre={tarea.proyectoNombre} />
        {tarea.dueDate && (
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-bold', vencida ? 'text-rose-500' : 'text-[var(--t-muted)]')}>
            <CalendarDays className="w-3 h-3" />
            {formatearFechaCorta(tarea.dueDate)}
          </span>
        )}
        {clientes.map((parte) => (
          <button
            key={`${parte.tipo}-${parte.id}`}
            type="button"
            onClick={() => { if (parte.tipo === 'cliente') onAbrirCliente?.(parte.id); else onAbrirLead?.(parte.id); }}
            className={cn(
              'inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide',
              parte.tipo === 'cliente'
                ? 'bg-[color-mix(in_srgb,var(--tareas-accent)_12%,transparent)] text-[var(--tareas-accent)]'
                : 'bg-[var(--t-surface-2)] text-[var(--t-text-secondary)]',
            )}
          >
            {parte.tipo === 'cliente' ? ES.relaciones.fichaCorta : ES.relaciones.leadCorto} · {parte.name}
          </button>
        ))}
      </div>
      {tarea.subtareas.length > 0 && (
        <ul className="pl-7 space-y-1">
          {tarea.subtareas.map((paso, index) => (
            <li key={paso.id}>
              <button
                type="button"
                onClick={() => onToggleSub?.(tarea, index)}
                className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-[var(--t-hover)]"
              >
                <span
                  className={cn(
                    'w-3.5 h-3.5 shrink-0 rounded border-2 flex items-center justify-center',
                    paso.completed
                      ? 'bg-[var(--tareas-accent)] border-[var(--tareas-accent)]'
                      : 'border-neutral-300',
                  )}
                >
                  {paso.completed && <Check className="w-2 h-2 text-white" />}
                </span>
                <span className={cn('text-xs', paso.completed ? 'line-through text-[var(--t-muted)]' : 'text-[var(--t-text)]')}>
                  {paso.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function VistaColumnasMiembros(props: {
  tareas: Tarea[];
  miembros: MiembroFiltro[];
  destacadoId?: number | null;
  modo?: 'pagina' | 'dashboard';
  onToggle: (tarea: Tarea) => void;
  onPrepare?: (tarea: Tarea) => void;
  onOpen: (tarea: Tarea) => void;
  onToggleSub?: (tarea: Tarea, index: number) => void;
  onAbrirCliente?: (id: number) => void;
  /** Un lead no tiene ficha de cliente propia: abre la ficha en modo lead. */
  onAbrirLead?: (contactId: number) => void;
  clientesPorTarea?: Record<number, { id: number; name: string; tipo: 'cliente' | 'lead' }[]>;
  onAsignar?: (tarea: Tarea, miembroId: number) => void;
}) {
  const todasLasColumnas = agruparPorColumnasMiembro(props.tareas, props.miembros);
  const sinAsignar = tareasSinAsignar(props.tareas, props.miembros);
  const dashboard = props.modo === 'dashboard';
  const dragId = useRef<number | null>(null);
  const [dragOverClave, setDragOverClave] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  /**
   * En el panel de "todos los proyectos" las columnas sin tareas sólo ocupan
   * lugar. Se ocultan — PERO vuelven a aparecer mientras se arrastra una
   * tarea, porque una columna vacía es justamente la zona donde se suelta
   * para asignarle el trabajo a esa persona: esconderlas del todo dejaba sin
   * forma de asignar a quien no tiene nada.
   *
   * Si están todas vacías no se oculta ninguna, para no dejar un hueco.
   */
  const conTareas = todasLasColumnas.filter((columna) => columna.tareas.length > 0);
  const columnas = dashboard && !arrastrando && conTareas.length > 0 ? conTareas : todasLasColumnas;

  /**
   * Clases literales: Tailwind no genera `lg:grid-cols-${n}` armado en runtime.
   *
   * Las columnas son el equipo, así que pueden ser dos o quince. Hasta cuatro
   * entran en la grilla; de ahí en más se deja la fila que scrollea, que es lo
   * que ya hace en pantallas chicas: quince columnas apretadas en el ancho de
   * la pantalla no se leen.
   */
  const enGrilla = columnas.length <= 4;
  const columnasGrid = !enGrilla
    ? ''
    : columnas.length === 1
      ? 'lg:grid lg:grid-cols-1'
      : columnas.length === 2
        ? 'lg:grid lg:grid-cols-2'
        : columnas.length === 3
          ? 'lg:grid lg:grid-cols-3'
          : 'lg:grid lg:grid-cols-4';

  const tarjetaProps = {
    onDragStart: (tarea: Tarea) => {
      dragId.current = tarea.id;
      setArrastrando(true);
    },
    onDragEnd: () => {
      dragId.current = null;
      setArrastrando(false);
      setDragOverClave(null);
    },
    onToggle: props.onToggle,
    onPrepare: props.onPrepare,
    onOpen: props.onOpen,
    onToggleSub: props.onToggleSub,
    onAbrirCliente: props.onAbrirCliente,
    onAbrirLead: props.onAbrirLead,
    clientesPorTarea: props.clientesPorTarea,
  };

  return (
    // `tareas-sobre-oscuro` reescribe los tokens de tema para este subárbol:
    // sin la superficie de las columnas, el texto y los chips quedaban con
    // colores de tema claro sobre el gradiente oscuro de la pantalla.
    <div className={cn('space-y-8', dashboard && 'tareas-sobre-oscuro')}>
      <div className={cn(
        'flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:items-start',
        enGrilla && 'lg:overflow-visible',
        columnasGrid,
        dashboard ? 'pb-2' : 'pb-32 -mx-4 px-4 lg:mx-0 lg:px-0',
      )}>
        {columnas.map((columna) => {
          const activa = props.destacadoId != null && columna.miembro?.id === props.destacadoId;
          const inicial = columna.label.slice(0, 1);
          return (
            <section
              key={columna.clave}
              className={cn(
                // La columna no es un contenedor: no tiene fondo, ni borde, ni
                // alto máximo. Antes era una caja con `--t-surface` y
                // `max-h-[70vh]`, así que las tareas scrolleaban DENTRO de un
                // marco que se comía el alto y partía la lista en dos scrolls.
                // Ahora el encabezado ordena la columna y las tareas bajan
                // todas, con el scroll de la página.
                'w-[80vw] max-w-sm shrink-0 flex flex-col gap-3',
                enGrilla ? 'lg:w-auto lg:max-w-none' : 'lg:w-[19rem]',
                'rounded-2xl transition-shadow',
                activa && 'ring-2 ring-[var(--tareas-accent)]',
                dragOverClave === columna.clave && columna.miembro && 'ring-2 ring-[var(--tareas-accent)] ring-dashed',
              )}
              onDragOver={(event) => {
                if (!columna.miembro) return;
                event.preventDefault();
                setDragOverClave(columna.clave);
              }}
              onDragLeave={() => setDragOverClave((prev) => (prev === columna.clave ? null : prev))}
              onDrop={(event) => {
                event.preventDefault();
                setDragOverClave(null);
                const tareaId = dragId.current;
                dragId.current = null;
                const miembro = columna.miembro;
                if (!tareaId || !miembro) return;
                const tarea = props.tareas.find((t) => t.id === tareaId);
                if (tarea) props.onAsignar?.(tarea, miembro.id);
              }}
            >
              <header className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0"
                    style={{ background: 'var(--tareas-accent)' }}
                  >
                    {inicial}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-bold text-sm text-[var(--t-text)] truncate">{columna.label}</h2>
                    <p className="text-[10px] font-medium text-[var(--t-muted)]">
                      {ES.contadores.tareas(columna.tareas.filter(esActiva).length)}
                    </p>
                  </div>
                </div>
                <span className={C.badge}>{columna.tareas.length}</span>
              </header>

              <div className="space-y-2">
                {columna.tareas.length === 0 && (
                  <p className="text-sm text-[var(--t-muted)] px-1 py-6 text-center">{ES.miembros.sinTareas}</p>
                )}
                {columna.tareas.map((tarea) => (
                  <TarjetaMiembro key={tarea.id} tarea={tarea} {...tarjetaProps} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {sinAsignar.length > 0 && (
        // Este bloque cuelga directo del fondo siempre-oscuro de Espacios (fuera de cualquier
        // `--t-surface` con tema), así que va con blanco fijo — igual que el rótulo de arriba —
        // en vez de `C.rotulo`/`C.badge`, que asumen una superficie clara en tema claro.
        <section className="space-y-3">
          <header>
            <div className="flex items-center gap-2">
              <h2 className="text-[10px] uppercase font-black tracking-[0.2em] text-white/50">{ES.miembros.sinAsignar}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-white/10 text-white/70">{sinAsignar.length}</span>
            </div>
            <p className="text-[11px] text-white/40 mt-1">{ES.miembros.sinAsignarBajada}</p>
          </header>
          <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-1">
            {sinAsignar.map((tarea) => (
              <div key={tarea.id} className="w-[80vw] max-w-sm shrink-0 lg:w-80">
                <TarjetaMiembro tarea={tarea} {...tarjetaProps} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
