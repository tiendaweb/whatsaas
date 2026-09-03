import { ES } from '../i18n/es';

export const TZ = 'America/Argentina/Buenos_Aires';

const ymdFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function claveDia(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return ymdFmt.format(date);
}

export function hoyClave(): string {
  return ymdFmt.format(new Date());
}

export function mediodiaUtc(clave: string): string {
  return `${clave}T12:00:00.000Z`;
}

export function hoyMediodiaIso(): string {
  return mediodiaUtc(hoyClave());
}

export function sumarDiasIso(iso: string | null, dias: number): string {
  const base = claveDia(iso) ?? hoyClave();
  const [y, m, d] = base.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + dias, 12, 0, 0));
  return date.toISOString().replace(/\.\d{3}Z$/, '.000Z').replace(/T\d{2}:\d{2}:\d{2}/, 'T12:00:00');
}

export function sumarMesesIso(iso: string | null, meses: number): string {
  const base = claveDia(iso) ?? hoyClave();
  const [y, m, d] = base.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + meses, d, 12, 0, 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T12:00:00.000Z`;
}

export function parseDdMm(token: string, now = new Date()): string | null {
  const parts = token.split('/').map((p) => Number(p));
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [dd, mm, yy] = parts;
  const year = yy
    ? yy < 100
      ? 2000 + yy
      : yy
    : Number(ymdFmt.format(now).slice(0, 4));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const clave = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return mediodiaUtc(clave);
}

export function formatearFechaLarga(iso: string | null): string {
  const clave = claveDia(iso);
  if (!clave) return '';
  const [y, m, d] = clave.split('-');
  return `${Number(d)} ${ES.calendario.mesesCorto[Number(m) - 1]} ${y}`;
}

export function formatearFechaCorta(iso: string | null): string {
  const clave = claveDia(iso);
  if (!clave) return '';
  const [, m, d] = clave.split('-');
  return `${Number(d)} ${ES.calendario.mesesCorto[Number(m) - 1]}`;
}

export function formatearMesAnio(year: number, monthIndex: number): string {
  return `${ES.calendario.meses[monthIndex]} ${year}`;
}

export function esVencida(iso: string | null, activa: boolean): boolean {
  if (!activa || !iso) return false;
  const clave = claveDia(iso);
  return !!clave && clave < hoyClave();
}

export function esHoy(iso: string | null): boolean {
  const clave = claveDia(iso);
  return !!clave && clave === hoyClave();
}

export function mananaClave(): string {
  return claveDia(sumarDiasIso(hoyMediodiaIso(), 1)) ?? '';
}

export function finDeSemanaClave(): string {
  const hoy = new Date();
  const parts = ymdFmt.formatToParts(hoy);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = utc.getUTCDay();
  const toSat = 6 - dow;
  return claveDia(sumarDiasIso(hoyMediodiaIso(), toSat)) ?? '';
}

export function partesCalendario(value: Date = new Date()) {
  const clave = ymdFmt.format(value);
  const [year, month, day] = clave.split('-').map(Number);
  return { year, month, day, clave };
}
