import { ZONA_NEGOCIO, desdeZona, fechaEnZona, partesEnZona, sumarDias } from '@/lib/time/zona';

/**
 * Próxima salida de un programado.
 *
 * Diarios y semanales se calculan en la zona del negocio (Argentina), no en la
 * del servidor: el contenedor corre en UTC y con `setHours` "todos los días a
 * las 10" salía a las 7 de la mañana. `hour`/`minute` son la hora que la
 * persona escribió, en su reloj.
 *
 * `afterRun` es para el cron después de enviar: un `once` ya salió y no tiene
 * próxima; un recurrente calcula la siguiente a partir de ahora.
 */
export function computeNextRunAt(msg: {
  scheduleType: string;
  scheduledAt?: Date | null;
  hour?: number | null;
  minute?: number | null;
  weekdays?: number[] | null;
}, opts: { afterRun?: boolean; now?: Date; timeZone?: string } = {}): Date | null {
  const now = opts.now ?? new Date();
  const tz = opts.timeZone ?? ZONA_NEGOCIO;
  const hour = msg.hour ?? 9;
  const minute = msg.minute ?? 0;

  if (msg.scheduleType === 'once') {
    return opts.afterRun ? null : (msg.scheduledAt ?? null);
  }

  if (msg.scheduleType === 'daily') {
    const hoy = fechaEnZona(now, tz);
    const next = desdeZona(hoy, hour, minute, tz);
    return next <= now ? desdeZona(sumarDias(hoy, 1), hour, minute, tz) : next;
  }

  if (msg.scheduleType === 'weekly') {
    const weekdays = msg.weekdays ?? [];
    if (!weekdays.length) return null;
    const hoy = fechaEnZona(now, tz);
    // Hoy cuenta si la hora todavía no pasó; después, los siguientes siete días.
    for (let i = 0; i <= 7; i += 1) {
      const fecha = sumarDias(hoy, i);
      const next = desdeZona(fecha, hour, minute, tz);
      if (next <= now) continue;
      if (weekdays.includes(partesEnZona(next, tz).weekday)) return next;
    }
    return null;
  }

  return null;
}
