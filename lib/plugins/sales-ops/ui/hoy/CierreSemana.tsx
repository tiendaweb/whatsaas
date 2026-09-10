'use client';

import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, Clock, PackageCheck, Send, Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CierreSemanal } from '../../server/cierre';
import { SALES_OPS_API, fetcher, fmtInt } from '../components/format';
import { CH } from './estilo';

/**
 * Cierre de la semana: seis números de trabajo TERMINADO.
 *
 * Los tableros que ya había miden actividad —clasificaciones, señales,
 * llamadas de conector— y la actividad sube justo cuando el sistema produce
 * trabajo que después nadie cierra. Estos seis sólo cuentan cosas que
 * terminaron: si alguno da cero, esa semana esa parte no produjo nada por más
 * movimiento que se viera en el Muro.
 *
 * El de decisiones lleva además cuánto hace que espera la más vieja, que es el
 * número que avisa antes de que la cola se vuelva un archivo.
 */
type Celda = {
  label: string;
  icon: LucideIcon;
  valor: string;
  detalle: string;
  alerta?: boolean;
};

function celdas(c: CierreSemanal): Celda[] {
  const horasViejas = c.decisiones.masViejaHoras;
  const entregadoSinEnlace = c.entregas.entregados - c.entregas.conEnlace;
  return [
    {
      label: 'Decisiones tomadas',
      icon: CheckCircle2,
      valor: fmtInt(c.decisiones.total),
      detalle: `${fmtInt(c.decisiones.aprobadas)} sí · ${fmtInt(c.decisiones.rechazadas)} no · ${fmtInt(c.decisiones.pendientes)} esperando`,
      alerta: horasViejas != null && horasViejas > 48,
    },
    {
      label: 'La más vieja sin decidir',
      icon: Clock,
      valor: horasViejas == null ? '—' : horasViejas >= 48 ? `${Math.floor(horasViejas / 24)} d` : `${horasViejas} h`,
      detalle: horasViejas == null ? 'nada esperando' : horasViejas > 48 ? 'ya debería haberse cerrado sola' : 'dentro del plazo',
      alerta: horasViejas != null && horasViejas > 48,
    },
    {
      label: 'Le llegó al cliente',
      icon: Send,
      valor: fmtInt(c.alCliente.enviados + c.alCliente.programados),
      detalle: `${fmtInt(c.alCliente.enviados)} enviados · ${fmtInt(c.alCliente.programados)} programados`,
    },
    {
      label: 'Respuestas cerradas',
      icon: CheckCircle2,
      valor: fmtInt(c.respuestas.atendidas),
      detalle: `entraron ${fmtInt(c.respuestas.nuevas)} · quedan ${fmtInt(c.respuestas.pendientes)}`,
      alerta: c.respuestas.pendientes > c.respuestas.atendidas,
    },
    {
      label: 'Entregado',
      icon: PackageCheck,
      valor: fmtInt(c.entregas.conEnlace),
      detalle: entregadoSinEnlace > 0 ? `${fmtInt(entregadoSinEnlace)} sin enlace · ${fmtInt(c.entregas.enCurso)} en curso` : `${fmtInt(c.entregas.enCurso)} en curso`,
      alerta: entregadoSinEnlace > 0,
    },
    {
      label: 'Horas registradas',
      icon: Timer,
      valor: c.horas.total > 0 ? `${c.horas.total} h` : '—',
      detalle:
        c.horas.total > 0
          ? Object.entries(c.horas.porContexto)
              .map(([k, v]) => `${k} ${v} h`)
              .join(' · ')
          : 'nadie arrancó un bloque',
      alerta: c.horas.total === 0,
    },
  ];
}

export function CierreSemana() {
  const { data, error, isLoading } = useSWR<CierreSemanal>(`${SALES_OPS_API}/cierre`, fetcher, { refreshInterval: 300_000 });

  if (error) return null;

  return (
    <section className={cn('p-5', CH.card)} aria-label="Cierre de la semana">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight">Cierre de los últimos 7 días</h3>
        <span className="text-[11px] text-muted-foreground">sólo trabajo terminado</span>
      </header>

      {isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {celdas(data).map((celda) => (
            <div
              key={celda.label}
              className={cn(
                'rounded-xl border p-3',
                celda.alerta ? 'border-amber-300/70 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5' : 'border-border/60 bg-card',
              )}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {celda.alerta ? <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden /> : <celda.icon className="size-3.5" aria-hidden />}
                {celda.label}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums leading-none">{celda.valor}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{celda.detalle}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
