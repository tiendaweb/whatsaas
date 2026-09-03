'use client';

import { useMemo, useState } from 'react';
import { ArrowDownAZ, Clock3, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KIND_META, PROPOSITO_META, esProposito, type EventoRow } from '../../shared/tipos';
import { C } from '../data/clases';
import { KIND_ICON } from '../data/iconos';
import { claveDia, hora } from '../data/fechas';
import { DIAS_CORTOS } from '../data/tipos-ui';

type Orden = 'tiempo' | 'titulo' | 'persona';

/**
 * Línea de tiempo (Gantt) del período.
 *
 * Cada evento es una barra ubicada donde cae en el tiempo y con el ancho de su
 * duración: es la única vista que muestra a la vez *cuándo* y *cuánto*, que es
 * lo que hace falta para ver huecos y superposiciones antes de agendar.
 *
 * Se arrastra una barra para mover el evento de día u hora (paso de 30 min);
 * al soltar se guarda. Los cancelados se ven translúcidos.
 */
export function VistaGantt({
  desde,
  hasta,
  eventos,
  onAbrir,
  onMover,
}: {
  desde: Date;
  hasta: Date;
  eventos: EventoRow[];
  onAbrir: (e: EventoRow) => void;
  onMover: (evento: EventoRow, nuevoInicio: Date) => void;
}) {
  const [orden, setOrden] = useState<Orden>('tiempo');
  const [arrastrando, setArrastrando] = useState<{ id: number; deltaMs: number } | null>(null);

  const total = Math.max(1, hasta.getTime() - desde.getTime());
  const dias = useMemo(() => {
    const salida: Date[] = [];
    const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
    while (cursor <= hasta && salida.length < 62) {
      salida.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return salida;
  }, [desde, hasta]);

  const filas = useMemo(() => {
    const lista = [...eventos];
    if (orden === 'titulo') lista.sort((a, b) => a.title.localeCompare(b.title));
    else if (orden === 'persona') lista.sort((a, b) => (a.relatedUserName ?? a.contactName ?? 'zz').localeCompare(b.relatedUserName ?? b.contactName ?? 'zz'));
    else lista.sort((a, b) => (a.ocurrencia ?? a.startsAt).localeCompare(b.ocurrencia ?? b.startsAt));
    return lista;
  }, [eventos, orden]);

  const ahora = new Date();
  const posAhora = ((ahora.getTime() - desde.getTime()) / total) * 100;

  if (!filas.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--c-border-2)] p-10 text-center">
        <p className="text-sm font-semibold text-[var(--c-text)]">Nada en este período</p>
        <p className="mt-1 text-xs text-[var(--c-text-secondary)]">Cambiá el rango o agendá algo.</p>
      </div>
    );
  }

  const ORDENES: Array<{ id: Orden; label: string; icon: typeof Clock3 }> = [
    { id: 'tiempo', label: 'Por hora', icon: Clock3 },
    { id: 'titulo', label: 'Por título', icon: ArrowDownAZ },
    { id: 'persona', label: 'Por persona', icon: Users },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {ORDENES.map((o) => (
          <button key={o.id} type="button" onClick={() => setOrden(o.id)} className={cn(C.chip, orden === o.id ? C.chipActive : C.chipIdle)}>
            <o.icon className="size-3.5" aria-hidden />
            {o.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-[var(--c-muted)]">Arrastrá una barra para moverla de día u hora.</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* Regla de días */}
          <div className="sticky top-0 z-10 mb-1 flex border-b border-[var(--c-border)] bg-[var(--c-bg)] pb-1">
            <span className="w-44 shrink-0" />
            <span className="relative flex-1">
              {dias.map((d) => {
                const izq = ((d.getTime() - desde.getTime()) / total) * 100;
                return (
                  <span
                    key={d.toISOString()}
                    className={cn('absolute -translate-x-1/2 text-[10px] font-black uppercase tracking-[0.14em]', claveDia(d) === claveDia(ahora) ? 'text-[var(--cal-accent)]' : 'text-[var(--c-muted)]')}
                    style={{ left: `${Math.max(0, Math.min(100, izq))}%` }}
                  >
                    {DIAS_CORTOS[d.getDay()]} {d.getDate()}
                  </span>
                );
              })}
            </span>
          </div>

          <div className="relative">
            {/* Líneas de día y marca de "ahora" */}
            <div className="pointer-events-none absolute inset-y-0 left-44 right-0">
              {dias.map((d) => (
                <span key={`l-${d.toISOString()}`} className="absolute inset-y-0 w-px bg-[var(--c-border)]" style={{ left: `${((d.getTime() - desde.getTime()) / total) * 100}%` }} />
              ))}
              {posAhora >= 0 && posAhora <= 100 && <span className="absolute inset-y-0 w-px bg-[var(--cal-accent)]" style={{ left: `${posAhora}%` }} />}
            </div>

            <ul className="space-y-1">
              {filas.map((e) => {
                const inicio = new Date(e.ocurrencia ?? e.startsAt);
                const duracion = Math.max(15 * 60000, new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime());
                const desplazado = arrastrando?.id === e.id ? arrastrando.deltaMs : 0;
                const izq = ((inicio.getTime() + desplazado - desde.getTime()) / total) * 100;
                const ancho = (duracion / total) * 100;
                const Icon = KIND_ICON[e.kind] ?? KIND_ICON.other;
                const color = e.color || (esProposito(e.subtype) ? PROPOSITO_META[e.subtype].color : 'var(--cal-accent)');
                return (
                  <li key={`${e.id}-${e.ocurrencia ?? ''}`} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => onAbrir(e)}
                      className="flex w-44 shrink-0 items-center gap-1.5 truncate pr-2 text-left text-xs text-[var(--c-text)] hover:underline"
                      title={e.title}
                    >
                      <Icon className="size-3 shrink-0 text-[var(--c-muted)]" aria-hidden />
                      <span className="truncate">{e.title}</span>
                    </button>
                    <span className="relative h-7 flex-1">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => onAbrir(e)}
                        onKeyDown={(ev) => ev.key === 'Enter' && onAbrir(e)}
                        onPointerDown={(ev) => {
                          const barra = ev.currentTarget.parentElement as HTMLElement;
                          const anchoPx = barra.getBoundingClientRect().width;
                          const x0 = ev.clientX;
                          const mover = (m: PointerEvent) => {
                            const ms = ((m.clientX - x0) / anchoPx) * total;
                            // Paso de media hora: mover al minuto exacto con el mouse es imposible.
                            setArrastrando({ id: e.id, deltaMs: Math.round(ms / 1800000) * 1800000 });
                          };
                          const soltar = () => {
                            window.removeEventListener('pointermove', mover);
                            window.removeEventListener('pointerup', soltar);
                            setArrastrando((actual) => {
                              if (actual && actual.id === e.id && actual.deltaMs !== 0) onMover(e, new Date(inicio.getTime() + actual.deltaMs));
                              return null;
                            });
                          };
                          window.addEventListener('pointermove', mover);
                          window.addEventListener('pointerup', soltar);
                        }}
                        title={`${e.title} · ${hora(e.ocurrencia ?? e.startsAt)}`}
                        className={cn(
                          'absolute top-1 flex h-5 cursor-grab items-center gap-1 overflow-hidden rounded-full px-2 text-[10px] font-semibold text-white active:cursor-grabbing',
                          e.status === 'canceled' && 'opacity-40 line-through',
                        )}
                        style={{ left: `${Math.max(0, Math.min(99, izq))}%`, width: `${Math.max(1.5, Math.min(100 - Math.max(0, izq), ancho))}%`, background: color, minWidth: 44 }}
                      >
                        {hora(new Date(inicio.getTime() + desplazado).toISOString())}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
