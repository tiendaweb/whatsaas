'use client';

import { PROGRAMADOS_API, programadosFetcher as fetchProgramados } from '@/lib/plugins/scheduled-messages/ui/swr';

/** Cliente del plugin de Mensajes programados, visto desde el Command Center. */

export type Programado = {
  id: number;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  instanceName?: string | null;
  targetNumbers: string[];
  scheduleType: 'once' | 'daily' | 'weekly';
  scheduledAt: string | null;
  hour: number | null;
  minute: number | null;
  weekdays: number[];
  actionType: 'message' | 'automation';
  automationName?: string | null;
  message: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  lastError: string | null;
  aiPrompt: string | null;
};

export type RespuestaProgramados = { disponible: boolean; rows: Programado[] };

/**
 * La clave y el fetcher son los del plugin dueño del endpoint. Había tres copias
 * de esto —acá, en la ficha y en la app de Programados— y una cuarta que
 * devolvía el array pelado: SWR cachea por clave y no por fetcher, así que las
 * formas distintas se pisaban y la que perdía la carrera recibía la del otro.
 */
export { PROGRAMADOS_API };

export const programadosFetcher = (url: string): Promise<RespuestaProgramados> => fetchProgramados<Programado>(url);

export async function patchProgramado(id: number, cuerpo: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${PROGRAMADOS_API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) {
    const detalle = await res.json().catch(() => null);
    throw new Error(typeof detalle?.error === 'string' ? detalle.error : `No se pudo guardar (error ${res.status}).`);
  }
}

export async function borrarProgramado(id: number): Promise<void> {
  const res = await fetch(`${PROGRAMADOS_API}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`No se pudo borrar (error ${res.status}).`);
}

export const DIAS_CORTOS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

export const ESTADO_LABEL: Record<Programado['status'], string> = {
  active: 'Activo',
  paused: 'Pausado',
  completed: 'Enviado',
  failed: 'Falló',
};

export const ESTADO_CLASE: Record<Programado['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  completed: 'bg-muted text-muted-foreground',
  failed: 'bg-destructive/15 text-destructive',
};

/** Está esperando salir (aunque esté en pausa) y no es archivo. */
export const estaPendiente = (p: Programado) => p.status === 'active' || p.status === 'paused';

export function horaDe(p: Programado): string | null {
  if (p.hour == null) return null;
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute ?? 0).padStart(2, '0')}`;
}

/**
 * A qué hora del día sale.
 *
 * Los recurrentes la tienen en `hour`; los de una sola vez, adentro de la
 * fecha. Sin unificarlo el mapa de horarios mostraría sólo la mitad de los
 * programados, que son justo los que se repiten todos los días.
 */
export function horaDelDia(p: Programado): number | null {
  if (p.scheduleType !== 'once') return p.hour ?? null;
  const cuando = p.scheduledAt ?? p.nextRunAt ?? p.lastRunAt;
  if (!cuando) return null;
  const fecha = new Date(cuando);
  return Number.isFinite(fecha.getTime()) ? fecha.getHours() : null;
}

/** Texto de cuándo sale, en la misma forma que la ficha del contacto. */
export function cuando(p: Programado, fmtDateTime: (v: string | null) => string): string {
  if (p.status === 'completed') return `Enviado ${fmtDateTime(p.lastRunAt)}`;
  // Sin fecha: se guarda para coordinar después. El cron sólo toma los que
  // tienen `next_run_at`, así que queda quieto hasta que alguien le ponga día.
  if (p.scheduleType === 'once' && !p.scheduledAt && !p.nextRunAt) return 'Sin fecha · a coordinar';
  const hora = horaDe(p);
  if (p.scheduleType === 'daily') return `Todos los días${hora ? ` ${hora}` : ''}`;
  if (p.scheduleType === 'weekly') {
    const dias = (p.weekdays ?? []).map((d) => DIAS_CORTOS[d] ?? '').filter(Boolean).join(' ');
    return `Cada semana${dias ? ` ${dias}` : ''}${hora ? ` ${hora}` : ''}`;
  }
  return `Sale ${fmtDateTime(p.scheduledAt ?? p.nextRunAt)}`;
}

/** `2026-09-01`, en hora local (no UTC: `toISOString` corre el día de madrugada). */
export function claveDia(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * En qué días del rango cae un programado.
 *
 * `next_run_at` sólo dice la **próxima** salida: un recurrente diario aparecería
 * una vez en el calendario y el resto de la semana se vería vacía, que es
 * justamente lo contrario de lo que se mira un calendario. Los recurrentes se
 * expanden acá con la misma regla que usa el servidor (`computeNextRunAt`):
 * diario, todos los días; semanal, los días elegidos.
 *
 * Los ya enviados caen en el día en que salieron: el calendario también sirve
 * para mirar atrás.
 */
export function diasOcupados(p: Programado, desde: Date, hasta: Date): string[] {
  const dias: string[] = [];
  const inicio = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  // Fin del día, no su medianoche: con `hasta` a las 00:00 un programado de
  // hoy a las 15 quedaba fuera del rango y la pestaña "Hoy" salía vacía.
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate(), 23, 59, 59, 999);

  if (!estaPendiente(p)) {
    const salida = p.lastRunAt ? new Date(p.lastRunAt) : null;
    if (salida && Number.isFinite(salida.getTime()) && salida >= inicio && salida <= fin) return [claveDia(salida)];
    return [];
  }

  if (p.scheduleType === 'once') {
    const cuando = p.scheduledAt ?? p.nextRunAt;
    const fecha = cuando ? new Date(cuando) : null;
    if (fecha && Number.isFinite(fecha.getTime()) && fecha >= inicio && fecha <= fin) return [claveDia(fecha)];
    return [];
  }

  // Recurrentes: se recorre el rango día por día. Son semanas o un mes, no hay
  // riesgo de recorrer de más.
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    // Un recurrente no "salió" en el pasado por el solo hecho de existir: lo que
    // ya pasó lo cuenta `lastRunAt`, no la regla.
    if (d < hoy) continue;
    if (p.scheduleType === 'daily' || (p.weekdays ?? []).includes(d.getDay())) dias.push(claveDia(d));
  }
  return dias;
}

/** `datetime-local` quiere hora local sin zona; `toISOString` da UTC. */
export function paraInput(iso: string | null): string {
  if (!iso) return '';
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) return '';
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * Deja la reescritura en la cola de conectores.
 *
 * "Reescribir con IA" corre con la cuota del equipo, y cuando esa cuota se
 * acaba —que pasa seguido a la tarde— el botón sólo sabía decir que falló: la
 * persona se quedaba con el mensaje viejo y sin salida. Esto encola el mismo
 * pedido para que lo haga un conector (Claude, ChatGPT o Grok) con su propia
 * cuota.
 *
 * El texto es autosuficiente a propósito: el conector no ve este formulario, así
 * que lleva el id, el texto actual y la indicación, y dice con qué herramienta
 * guardarlo.
 */
/**
 * Un programado con prompt pasa a la cola como pedido y deja de ser programado.
 *
 * Reemplaza a `encolarReescritura`: el prompt ya no se guarda en el programado
 * ni se limita a reescribir el texto. El conector lee el chat y decide si el
 * resultado es un mensaje, una demo o un proyecto en Tareas OS.
 */
export async function pasarACola(id: number, prompt?: string): Promise<{ runId: number; chatId: number | null }> {
  const res = await fetch(`/api/plugins/sales-ops/programados/${id}/a-cola`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prompt ? { prompt } : {}),
  });
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof cuerpo?.error === 'string' ? cuerpo.error : `No se pudo pasar a la cola (error ${res.status}).`);
  return { runId: Number(cuerpo?.run?.id), chatId: cuerpo?.chatId ?? null };
}

export async function encolarReescritura(input: {
  id: number;
  name: string;
  message: string;
  aiPrompt: string;
  chatId?: number | null;
}): Promise<void> {
  const texto = [
    `Reescribí el mensaje del programado #${input.id} ("${input.name}").`,
    `INDICACIÓN:\n${input.aiPrompt.trim()}`,
    input.message.trim() ? `TEXTO ACTUAL:\n${input.message.trim()}` : 'TEXTO ACTUAL: (vacío, escribilo de cero)',
    `Guardá el texto nuevo con whatspro_manage_scheduled_message (action: "update", id: ${input.id}, message: <texto nuevo>). No cambies el horario ni el estado.`,
  ].join('\n\n');

  const res = await fetch('/api/plugins/sales-ops/prompts/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: texto,
      title: `Reescribir "${input.name}"`.slice(0, 160),
      targetKind: input.chatId ? 'chat' : 'team',
      targetId: input.chatId ?? null,
      mode: 'queue',
    }),
  });
  if (!res.ok) {
    const detalle = await res.json().catch(() => null);
    throw new Error(typeof detalle?.error === 'string' ? detalle.error : `No se pudo encolar (error ${res.status}).`);
  }
}

export type ChatDeTelefono = { chatId: number; name: string; phone: string; gate: string | null; avatarUrl: string | null };

/** Últimos 8 dígitos: la misma clave que usa el servidor para cruzar teléfonos. */
export function claveTelefono(numero: string | null | undefined): string | null {
  const digitos = (numero ?? '').replace(/\D/g, '');
  return digitos.length >= 8 ? digitos.slice(-8) : null;
}

/**
 * A qué chat corresponde cada destinatario de los programados.
 *
 * Se pide de a toda la lista y una sola vez: resolver de a un teléfono por
 * tarjeta serían cientos de requests para dibujar un botón.
 */
export async function resolverChats(numeros: string[]): Promise<Record<string, ChatDeTelefono>> {
  if (!numeros.length) return {};
  const res = await fetch('/api/plugins/sales-ops/scheduled/targets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ numbers: numeros.slice(0, 500) }),
  });
  if (!res.ok) return {};
  const body = (await res.json().catch(() => ({}))) as { map?: Record<string, ChatDeTelefono> };
  return body.map ?? {};
}
