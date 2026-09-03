'use client';

import { useSearchParams } from 'next/navigation';
import { CalendarioApp } from '../ui-nueva/CalendarioApp';
import { CalendarTaskDashboard } from './CalendarTaskDashboard';

/**
 * Qué calendario se abre.
 *
 * La app nueva (eventos, reuniones, llamadas) es la de todos los días; el
 * tablero viejo —que en realidad es el calendario de TAREAS con su gantt— sigue
 * disponible en `?ui=clasico` porque es otra herramienta, no una versión vieja
 * de la misma.
 */
export function CalendarSurface() {
  const params = useSearchParams();
  if (params.get('ui') === 'clasico') return <CalendarTaskDashboard />;
  return <CalendarioApp />;
}
