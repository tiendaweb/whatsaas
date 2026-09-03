import { ES } from '../i18n/es';
import { claveDia, hoyClave, partesCalendario, sumarDiasIso, hoyMediodiaIso } from './fechas';
import { esActiva } from './vistas';
import type { Prioridad, Tarea } from './tipos';

export type Metricas = {
  racha: number;
  completadas: number;
  eficiencia: number;
  vencidas: number;
  velocidad: { clave: string; label: string; valor: number }[];
  promedioDiario: number;
  mezcla: Record<Prioridad, number>;
  mezclaPct: Record<Prioridad, number>;
  totalActivas: number;
  pico: string;
};

function diasHaciaAtras(n: number): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const iso = sumarDiasIso(hoyMediodiaIso(), -i);
    const clave = claveDia(iso);
    if (clave) keys.push(clave);
  }
  return keys;
}

export function calcularMetricas(tareas: Tarea[]): Metricas {
  const hoy = hoyClave();
  const done = tareas.filter((tarea) => tarea.status === 'done');
  const activas = tareas.filter(esActiva);
  const vencidas = activas.filter((tarea) => {
    const clave = claveDia(tarea.dueDate);
    return !!clave && clave < hoy;
  }).length;

  const byCompletedDay = new Map<string, number>();
  for (const tarea of done) {
    const clave = claveDia(tarea.completedAt);
    if (!clave) continue;
    byCompletedDay.set(clave, (byCompletedDay.get(clave) ?? 0) + 1);
  }

  let racha = 0;
  for (let i = 0; ; i += 1) {
    const clave = claveDia(sumarDiasIso(hoyMediodiaIso(), -i));
    if (!clave) break;
    if ((byCompletedDay.get(clave) ?? 0) > 0) racha += 1;
    else break;
  }

  const velocidad = diasHaciaAtras(7).map((clave) => {
    const [, m, d] = clave.split('-');
    return {
      clave,
      label: `${Number(d)} ${ES.calendario.mesesCorto[Number(m) - 1]}`,
      valor: byCompletedDay.get(clave) ?? 0,
    };
  });
  const promedioDiario = velocidad.reduce((n, day) => n + day.valor, 0) / 7;

  const mezcla: Record<Prioridad, number> = { alta: 0, media: 0, baja: 0 };
  for (const tarea of activas) mezcla[tarea.prioridad] += 1;
  const totalActivas = activas.length;
  const mezclaPct: Record<Prioridad, number> = {
    alta: totalActivas ? Math.round((mezcla.alta / totalActivas) * 100) : 0,
    media: totalActivas ? Math.round((mezcla.media / totalActivas) * 100) : 0,
    baja: totalActivas ? Math.round((mezcla.baja / totalActivas) * 100) : 0,
  };

  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const tarea of done) {
    if (!tarea.completedAt) continue;
    const { year, month, day } = partesCalendario(new Date(tarea.completedAt));
    const dow = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
    byWeekday[dow] += 1;
  }
  const max = Math.max(...byWeekday);
  const pico = max <= 0 ? ES.metricas.sinDatos : ES.calendario.diasLargos[byWeekday.indexOf(max)];

  return {
    racha,
    completadas: done.length,
    eficiencia: tareas.length ? Math.round((done.length / tareas.length) * 100) : 0,
    vencidas,
    velocidad,
    promedioDiario: Math.round(promedioDiario * 10) / 10,
    mezcla,
    mezclaPct,
    totalActivas,
    pico,
  };
}
