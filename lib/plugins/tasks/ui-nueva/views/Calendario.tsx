'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Radar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { C } from '../data/clases';
import { claveDia, formatearMesAnio, hoyClave, partesCalendario } from '../data/fechas';
import { PRIO_COLORES, type Tarea } from '../data/tipos';
import { ES } from '../i18n/es';

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function Calendario(props: { tareas: Tarea[]; onOpen: (tarea: Tarea) => void }) {
  const today = partesCalendario();
  const [cursor, setCursor] = useState({ year: today.year, month: today.month });

  const grid = useMemo(() => {
    const first = new Date(cursor.year, cursor.month - 1, 1);
    const startPad = first.getDay();
    const count = daysInMonth(cursor.year, cursor.month);
    const prevCount = daysInMonth(cursor.year, cursor.month === 1 ? 12 : cursor.month - 1);
    const cells: { clave: string; day: number; current: boolean }[] = [];
    for (let i = startPad - 1; i >= 0; i -= 1) {
      const day = prevCount - i;
      const month = cursor.month === 1 ? 12 : cursor.month - 1;
      const year = cursor.month === 1 ? cursor.year - 1 : cursor.year;
      cells.push({
        clave: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
        current: false,
      });
    }
    for (let day = 1; day <= count; day += 1) {
      cells.push({
        clave: `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
        current: true,
      });
    }
    const trailing = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= trailing; day += 1) {
      const month = cursor.month === 12 ? 1 : cursor.month + 1;
      const year = cursor.month === 12 ? cursor.year + 1 : cursor.year;
      cells.push({
        clave: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
        current: false,
      });
    }
    return cells;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, Tarea[]>();
    for (const tarea of props.tareas) {
      const clave = claveDia(tarea.dueDate);
      if (!clave) continue;
      const list = map.get(clave) ?? [];
      list.push(tarea);
      map.set(clave, list);
    }
    return map;
  }, [props.tareas]);

  const hoy = hoyClave();

  return (
    <div className={`${C.card} p-6 mb-32`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-[var(--t-text)]">
          {formatearMesAnio(cursor.year, cursor.month - 1)}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-2 rounded-xl hover:bg-[var(--t-hover)]"
            onClick={() => setCursor((prev) => (
              prev.month === 1 ? { year: prev.year - 1, month: 12 } : { year: prev.year, month: prev.month - 1 }
            ))}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl text-sm font-bold hover:bg-[var(--t-hover)]"
            onClick={() => setCursor({ year: today.year, month: today.month })}
          >
            {ES.calendario.hoy}
          </button>
          <button
            type="button"
            className="p-2 rounded-xl hover:bg-[var(--t-hover)]"
            onClick={() => setCursor((prev) => (
              prev.month === 12 ? { year: prev.year + 1, month: 1 } : { year: prev.year, month: prev.month + 1 }
            ))}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {ES.calendario.dias.map((dia) => (
          <div key={dia} className="text-[10px] font-black tracking-widest text-[var(--t-muted)] text-center">
            {dia}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {grid.map((cell) => {
          const items = byDay.get(cell.clave) ?? [];
          const isToday = cell.clave === hoy;
          return (
            <div
              key={cell.clave}
              className={cn(
                'min-h-[110px] rounded-2xl p-2',
                cell.current ? 'bg-[var(--t-surface-2)]' : 'bg-transparent',
                isToday && 'ring-2 ring-[var(--tareas-accent)] bg-[var(--t-surface)]',
              )}
            >
              <div
                className={cn(
                  'text-sm font-bold w-7 h-7 flex items-center justify-center',
                  !cell.current && 'text-neutral-300',
                  isToday && 'rounded-full bg-[var(--tareas-accent)] text-white',
                )}
              >
                {cell.day}
              </div>
              <div className="mt-1 space-y-1">
                {items.slice(0, 3).map((tarea) => {
                  const esRadar = isRadarTaskTitle(tarea.title);
                  return (
                    <button
                      key={tarea.id}
                      type="button"
                      onClick={() => props.onOpen(tarea)}
                      // La celda del calendario es de 10px: acá el distintivo de Radar
                      // entra como icono suelto, un chip con fondo no daría el ancho.
                      title={esRadar ? `Generado por Radar · ${radarTaskTitle(tarea.title)}` : radarTaskTitle(tarea.title)}
                      className="w-full text-left text-[10px] font-bold truncate px-1.5 py-0.5 rounded-md text-white"
                      style={{ background: PRIO_COLORES[tarea.prioridad] }}
                    >
                      {esRadar && <Radar className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" aria-hidden="true" />}
                      {radarTaskTitle(tarea.title)}
                    </button>
                  );
                })}
                {items.length > 3 && (
                  <div className="text-[10px] font-bold text-[var(--t-muted)]">+{items.length - 3}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
