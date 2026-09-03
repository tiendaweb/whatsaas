'use client';

import { cn } from '@/lib/utils';
import type { EventoRow } from '../../shared/tipos';
import { diaDelEvento } from '../../shared/tipos';
import { claveDia } from '../data/fechas';
import { DIAS_CORTOS } from '../data/tipos-ui';

/** El mes completo. Cada celda muestra hasta tres eventos y el resto como "+N". */
export function VistaMes({ mes, eventos, onDia, onAbrir }: { mes: Date; eventos: EventoRow[]; onDia: (fecha: Date) => void; onAbrir: (e: EventoRow) => void }) {
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
  const previos = (primero.getDay() + 6) % 7;
  const celdas: Array<Date | null> = [
    ...Array.from({ length: previos }, () => null),
    ...Array.from({ length: ultimo.getDate() }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1)),
  ];
  const hoy = claveDia(new Date());
  const porDia = new Map<string, EventoRow[]>();
  for (const e of eventos) {
    const k = diaDelEvento(e);
    porDia.set(k, [...(porDia.get(k) ?? []), e]);
  }

  return (
    <div className="grid grid-cols-7 gap-1">
      {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((d) => (
        <span key={d} className="pb-1 text-center text-[10px] font-black uppercase tracking-[0.18em] text-[var(--c-muted)]">{d}</span>
      ))}
      {celdas.map((fecha, i) => {
        if (!fecha) return <span key={`hueco-${i}`} />;
        const clave = claveDia(fecha);
        const delDia = porDia.get(clave) ?? [];
        return (
          <button
            key={clave}
            type="button"
            onClick={() => onDia(fecha)}
            className={cn(
              'flex min-h-24 flex-col gap-0.5 rounded-xl border p-1.5 text-left transition-colors hover:bg-[var(--c-hover)]',
              clave === hoy ? 'border-[var(--cal-accent)]' : 'border-[var(--c-border)]',
            )}
          >
            <span className={cn('text-xs font-bold tabular-nums', clave === hoy ? 'text-[var(--cal-accent)]' : 'text-[var(--c-text-secondary)]')}>{fecha.getDate()}</span>
            {delDia.slice(0, 3).map((e) => (
              <span
                key={`${e.id}-${e.ocurrencia ?? ''}`}
                role="button"
                tabIndex={0}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onAbrir(e);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') {
                    ev.stopPropagation();
                    onAbrir(e);
                  }
                }}
                className="flex items-center gap-1 truncate rounded px-1 text-[10px] text-[var(--c-text)] hover:bg-[var(--c-chip)]"
                title={e.title}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: e.color || 'var(--cal-accent)' }} aria-hidden />
                <span className="truncate">{e.title}</span>
              </span>
            ))}
            {delDia.length > 3 && <span className="px-1 text-[10px] font-bold text-[var(--c-muted)]">+{delDia.length - 3}</span>}
          </button>
        );
      })}
    </div>
  );
}
