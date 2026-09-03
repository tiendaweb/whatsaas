import { claveDia } from '../../shared/tipos';
import { DIAS_CORTOS, MESES } from './tipos-ui';

export { claveDia };

export function inicioDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function finDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
/** Lunes de la semana de esa fecha: la semana laboral arranca ahí. */
export function lunesDe(d: Date): Date {
  const x = inicioDelDia(d);
  const dia = x.getDay();
  x.setDate(x.getDate() - (dia === 0 ? 6 : dia - 1));
  return x;
}
export function sumarDias(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function hora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function rangoHoras(inicio: string, fin: string): string {
  return `${hora(inicio)} – ${hora(fin)}`;
}
export function etiquetaDia(d: Date): string {
  return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()}`;
}
export function etiquetaLarga(d: Date): string {
  return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`;
}
export function mesLargo(d: Date): string {
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
/** `datetime-local` quiere hora local sin zona; `toISOString` da UTC. */
export function paraInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function deInput(valor: string): string {
  return new Date(valor).toISOString();
}
