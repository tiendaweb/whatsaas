import type { ListQuery } from '../../shared/api-types';
import { esSituacion, type Situacion } from '../../shared/situacion';
import { FRONT_SWEEP_GATES, type Gate } from '../../shared/taxonomy';

/** Los gates de "Dinero". Mismo corte que `MONEY_GATES` del servidor, que no se importa acá porque ese módulo es `server-only`. */
const MONEY_GATES: Gate[] = ['G8', 'G9', 'G10'];

/**
 * Piezas compartidas del Focus (doc 08).
 *
 * Las etapas son las mismas listas del embudo, en el orden en que conviene
 * trabajarlas: primero la plata que ya está decidida, después lo que está por
 * decidirse, y al final lo frío. Que sea el mismo orden del rail no es
 * casualidad: si acá fuera otro, la persona tendría que aprender dos.
 */
export const ETAPAS = ['dinero', 'oportunidades', 'barrido', 'limpieza'] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_LABELS: Record<Etapa, string> = {
  dinero: 'Dinero',
  oportunidades: 'Oportunidades',
  barrido: 'Barrido',
  limpieza: 'Limpieza',
};

export const ETAPA_HINTS: Record<Etapa, string> = {
  dinero: 'Eligieron comprar y falta el pago o el cierre operativo.',
  oportunidades: 'Recibieron precio y están decidiendo.',
  barrido: 'Se enfriaron antes de definir la necesidad.',
  limpieza: 'Descartes y ejecutados: se cierran, no se trabajan.',
};

export type OrdenFocus = NonNullable<ListQuery['sort']>;

export const ORDENES: Array<{ key: OrdenFocus; label: string; hint: string }> = [
  { key: 'priority', label: 'Prioridad', hint: 'Lo que más plata mueve, primero.' },
  { key: 'oldest', label: 'Más viejo', hint: 'El que hace más que no escribe.' },
  { key: 'age', label: 'Más nuevo', hint: 'El que escribió recién.' },
  { key: 'gate', label: 'Grado', hint: 'De G11 hacia abajo.' },
  { key: 'lastFollowup', label: 'Último impacto', hint: 'Por cuándo se lo tocó por última vez.' },
];

export type FiltrosFocus = {
  /** Qué etapas entran a la ronda. Se trabajan de a una, en el orden de ETAPAS. */
  etapas: Etapa[];
  /** Gates sueltos, para afinar dentro de la etapa. Vacío = los de la etapa. */
  gates: Gate[];
  /**
   * En qué situación tienen que estar. Vacío = todas.
   *
   * Es otro eje que la etapa y el grado: la etapa dice qué tan cerca está de
   * comprar y la situación dice si alguien ya lo tocó. Cruzarlos es lo que
   * permite una ronda de "Dinero + contestó y nadie fue", que es la media hora
   * más cara del día.
   */
  situaciones: Situacion[];
  /** `con` = sólo clientes, `sin` = sólo los que no lo son, `null` = todos. */
  cliente: 'con' | 'sin' | null;
  /** Sólo los que nadie puso en marcha todavía (`queued=sin`). */
  soloPendientes: boolean;
  orden: OrdenFocus;
};

export const FILTROS_INICIALES: FiltrosFocus = {
  etapas: [...ETAPAS],
  gates: [],
  situaciones: [],
  cliente: null,
  // Focus es una cola de trabajo: lo que ya tiene algo esperando salir no se
  // vuelve a trabajar. Se puede apagar, pero el default es el que sirve.
  soloPendientes: true,
  orden: 'priority',
};

export const LS_FILTROS = 'sales-ops:focus:filtros';
export const LS_BLOQUE = 'sales-ops:focus:bloque';
/**
 * El reloj de la supervisión tiene su propia clave. Compartían una y entrar a
 * supervisar heredaba el bloque a medias del Focus de trabajo (o al revés):
 * son dos tareas distintas y cada una arranca y termina sus 25 minutos.
 */
export const LS_BLOQUE_SUPERVISION = 'sales-ops:focus:bloque-supervision';
export const LS_PROMPT = 'sales-ops:focus:prompt';

/**
 * Título de una corrida encolada desde cualquiera de los dos Focus. Los dos
 * ponían uno distinto ("Focus · " y "Pedido · ") para el mismo pedido, y en la
 * Cola parecían dos cosas distintas.
 */
export function tituloDePedido(nombre: string): string {
  return `Pedido · ${nombre}`.slice(0, 160);
}

/**
 * A qué etapa del Focus pertenece un contacto por su gate. Es el mismo corte
 * que `vistaWhere` en el servidor, sin la parte del status (acá no hace falta:
 * sólo se usa para elegir qué atajos ofrecer).
 */
export function etapaDeGate(gate: Gate | null | undefined): Etapa {
  if (!gate) return 'oportunidades';
  if (gate === 'GX' || gate === 'G11') return 'limpieza';
  if (MONEY_GATES.includes(gate)) return 'dinero';
  if (FRONT_SWEEP_GATES.includes(gate)) return 'barrido';
  return 'oportunidades';
}

export const MINUTOS_BLOQUE = 25;
export const MINUTOS_DESCANSO = 5;

function esEtapa(v: unknown): v is Etapa {
  return typeof v === 'string' && (ETAPAS as readonly string[]).includes(v);
}

/** Lee los filtros guardados. Cualquier cosa rara vuelve al default: son preferencias, no datos. */
export function leerFiltros(): FiltrosFocus {
  try {
    const raw = window.localStorage.getItem(LS_FILTROS);
    if (!raw) return FILTROS_INICIALES;
    const parsed = JSON.parse(raw) as Partial<FiltrosFocus>;
    const etapas = Array.isArray(parsed.etapas) ? parsed.etapas.filter(esEtapa) : [];
    const orden = ORDENES.some((o) => o.key === parsed.orden) ? (parsed.orden as OrdenFocus) : FILTROS_INICIALES.orden;
    return {
      etapas: etapas.length ? ETAPAS.filter((e) => etapas.includes(e)) : FILTROS_INICIALES.etapas,
      gates: Array.isArray(parsed.gates) ? (parsed.gates.filter((g) => typeof g === 'string') as Gate[]) : [],
      situaciones: Array.isArray(parsed.situaciones) ? parsed.situaciones.filter(esSituacion) : [],
      cliente: parsed.cliente === 'con' || parsed.cliente === 'sin' ? parsed.cliente : null,
      soloPendientes: parsed.soloPendientes !== false,
      orden,
    };
  } catch {
    return FILTROS_INICIALES;
  }
}

export function guardarFiltros(filtros: FiltrosFocus) {
  try {
    window.localStorage.setItem(LS_FILTROS, JSON.stringify(filtros));
  } catch {
    /* sin storage */
  }
}

/** `mm:ss`, siempre con dos dígitos. Nunca negativo. */
export function reloj(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}
