/**
 * La zona horaria del negocio, en un solo lugar.
 *
 * El servidor corre en UTC (el contenedor no tiene TZ) y durante meses los
 * programados diarios y semanales se calcularon con `setHours` en hora del
 * servidor: un "todos los días a las 10" salía a las 7 de la mañana de
 * Argentina. Todo cálculo de "a qué hora" pasa por acá; nunca por
 * `setHours`/`getHours` a secas en el servidor.
 *
 * No hay TZ por equipo en `teams` todavía: `BUSINESS_TIMEZONE`, si no
 * `AI_CHAT_TIMEZONE`, si no `TZ`, y si no Argentina (que no tiene horario de
 * verano: UTC-3 todo el año).
 */

const FALLBACK = 'America/Argentina/Buenos_Aires';

function valida(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format();
    return true;
  } catch {
    return false;
  }
}

export const ZONA_NEGOCIO: string = [process.env.BUSINESS_TIMEZONE, process.env.AI_CHAT_TIMEZONE, process.env.TZ].find(valida) ?? FALLBACK;

export type PartesLocales = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number; fecha: string };

/** Año, mes, día, hora, minuto y día de la semana (0 = domingo) de un instante, en la zona del negocio. */
export function partesEnZona(date: Date, timeZone: string = ZONA_NEGOCIO): PartesLocales {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].findIndex((d) => wd.startsWith(d));
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return { year, month, day, hour: get('hour'), minute: get('minute'), second: get('second'), weekday: weekday < 0 ? 0 : weekday, fecha: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

/** `YYYY-MM-DD` de un instante en la zona del negocio. */
export function fechaEnZona(date: Date = new Date(), timeZone: string = ZONA_NEGOCIO): string {
  return partesEnZona(date, timeZone).fecha;
}

/** Suma días a un `YYYY-MM-DD` sin pasar por la hora local del servidor. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * El instante UTC que corresponde a "ese día a esa hora" en la zona del
 * negocio. Es la única forma correcta de armar una fecha a partir de una hora
 * que dijo una persona: `new Date('2026-09-06T10:00')` en el servidor da las
 * 10 UTC, que son las 7 en Argentina.
 */
export function desdeZona(fecha: string, hour: number, minute: number, timeZone: string = ZONA_NEGOCIO): Date {
  const [year, month, day] = fecha.split('-').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = desired;
  for (let i = 0; i < 3; i += 1) {
    const actual = partesEnZona(new Date(guess), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, 0);
    guess += desired - represented;
  }
  return new Date(guess);
}

/** `YYYY-MM-DDTHH:mm` (sin zona) → instante UTC interpretando la hora en la zona del negocio. `null` si no tiene esa forma. */
export function parsearLocal(valor: unknown, timeZone: string = ZONA_NEGOCIO): Date | null {
  if (typeof valor !== 'string') return null;
  const m = valor.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = desdeZona(m[1], Number(m[2]), Number(m[3]), timeZone);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Instante → `YYYY-MM-DDTHH:mm` en la zona del negocio (lo que quiere un `datetime-local`). */
export function aLocal(date: Date, timeZone: string = ZONA_NEGOCIO): string {
  const p = partesEnZona(date, timeZone);
  return `${p.fecha}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Horario laboral en el que tiene sentido que salga un mensaje. */
export const HORA_LABORAL = { desde: 8, hasta: 20, porDefecto: 10 } as const;

/**
 * Si el instante ya pasó, el próximo que tiene sentido: la misma hora mañana
 * cuando cae en horario laboral, y si no, mañana a las 10. Si no pasó, el
 * mismo instante.
 */
export function proximoHorarioFuturo(date: Date, ahora: Date = new Date(), timeZone: string = ZONA_NEGOCIO): { date: Date; ajustado: boolean } {
  if (date.getTime() >= ahora.getTime() + 60_000) return { date, ajustado: false };
  const p = partesEnZona(date, timeZone);
  const hoy = fechaEnZona(ahora, timeZone);
  const enLaboral = p.hour >= HORA_LABORAL.desde && p.hour < HORA_LABORAL.hasta;
  // Misma hora hoy si todavía no pasó (el pedido era "a las 16" y son las 11); si no, mañana.
  const candidatoHoy = desdeZona(hoy, p.hour, p.minute, timeZone);
  if (enLaboral && candidatoHoy.getTime() >= ahora.getTime() + 5 * 60_000) return { date: candidatoHoy, ajustado: true };
  const manana = sumarDias(hoy, 1);
  return { date: enLaboral ? desdeZona(manana, p.hour, p.minute, timeZone) : desdeZona(manana, HORA_LABORAL.porDefecto, 0, timeZone), ajustado: true };
}

/** Para mensajes: "sáb 6/9, 10:00" en la zona del negocio. */
export function formatoLocal(date: Date, timeZone: string = ZONA_NEGOCIO): string {
  try {
    return new Intl.DateTimeFormat('es-AR', { timeZone, weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  } catch {
    return date.toISOString();
  }
}
