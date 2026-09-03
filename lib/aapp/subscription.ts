const DAY_MS = 24 * 60 * 60 * 1000;

export type ServiceUrgency = 'expired' | 'critical' | 'warning' | 'ok';

/**
 * Días que le quedan al servicio. Las fechas de aapp.space son días sin hora (YYYY-MM-DD),
 * así que comparamos a medianoche local para no perder un día por zona horaria.
 */
export function daysUntil(endDate: string | null | undefined): number | null {
  if (!endDate) return null;
  const end = new Date(`${endDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((end.getTime() - today.getTime()) / DAY_MS);
}

export function serviceUrgency(days: number | null): ServiceUrgency {
  if (days === null) return 'ok';
  if (days < 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  return 'ok';
}

export function serviceLabel(days: number | null): string {
  if (days === null) return 'Sin vencimiento';
  if (days < 0) return `Vencido hace ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Vence hoy';
  return `Quedan ${days} día${days === 1 ? '' : 's'}`;
}
