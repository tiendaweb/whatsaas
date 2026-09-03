/**
 * La cola de trabajo unificada.
 *
 * Antes había tres listas de "lo que falta hacer", cada una con su forma y su
 * herramienta: la cola comercial de sales-ops, la worklist de prompts de Tareas
 * OS y la bandeja del Centro de comandos. Una IA que abría sesión no tenía cómo
 * saber cuál pedir, y pedir las tres significaba entender tres formatos.
 *
 * Acá se federan en un solo sobre. Los motores siguen viviendo en su plugin
 * —cada uno con sus permisos y su tabla—; lo único que se unifica es la forma
 * de contar qué hay para hacer.
 *
 * La distinción que NO se pierde al centralizar es `approval`. Antes la
 * garantizaba el hecho de que fueran herramientas separadas: la bandeja no
 * podía confundirse con trabajo aprobado porque vivía en otra tool. Ahora que
 * comparten cola, esa línea viaja como dato en cada ítem, y es la que sostiene
 * los frenos de ejecución.
 */

export const WORK_SOURCES = ['sales', 'tasks', 'inbox'] as const;
export type WorkSource = (typeof WORK_SOURCES)[number];

/**
 * - `ready`: una persona ya lo aprobó, o la acción no toca a nadie de afuera.
 *   La IA puede ejecutarlo siguiendo `steps`.
 * - `needs_human`: necesita criterio. La IA puede preparar y proponer, pero la
 *   ejecución pasa por una confirmación explícita.
 */
export const WORK_APPROVALS = ['ready', 'needs_human'] as const;
export type WorkApproval = (typeof WORK_APPROVALS)[number];

/**
 * Bandas de prioridad, en una sola escala para las tres fuentes.
 *
 * Se eligieron para que el orden resultante sea el que tiene sentido operativo,
 * no para que cada fuente conserve el suyo:
 *
 *   2600  una tarea trabada esperando una respuesta humana (bloquea al resto)
 *   2500  un prompt encolado y aprobado
 *   2400  preparar una tarea (convertir un prompt amplio en pasos)
 *   2200  ejecutar una tarea ya preparada
 *   2000  una acción comercial YA APROBADA por una persona
 *   1500  clasificar la respuesta nueva de un cliente
 *   1200  un pendiente URGENTE de la bandeja
 *   1000  clasificar un chat (menos el índice, para conservar su orden)
 *    900  transcribir un audio
 *    800  un pendiente normal de la bandeja (menos el índice)
 *
 * La bandeja va abajo a propósito: es lo que espera una decisión, así que una
 * IA que trabaja de arriba hacia abajo agota primero lo que puede resolver sola.
 */
export const WORK_PRIORITY = {
  taskNeedsContext: 2600,
  taskPrepare: 2400,
  taskExecute: 2200,
  inboxUrgent: 1200,
  inboxNormal: 800,
} as const;

export type UnifiedWorkItem = {
  source: WorkSource;
  /** El tipo nativo de la fuente (`classify`, `execute_action`, `chat`, `task`…). */
  kind: string;
  /**
   * Identidad estable del ítem dentro de su fuente. Sirve para saltearlo, para
   * reintentarlo y para no procesar dos veces lo mismo.
   *
   * En sales-ops es el id de la fila. En Tareas OS es
   * `{target_type}:{target_id}:{phase}` — y NO incluye el fingerprint, que
   * cambia cada vez que alguien edita el prompt: mezclarlos haría que un skip
   * se evapore con cualquier edición.
   */
  key: string;
  priority: number;
  approval: WorkApproval;
  title: string;
  detail: string | null;
  /** El chat al que pertenece, si pertenece a alguno. Nunca un teléfono. */
  chatId: number | null;
  /** La cadena exacta de herramientas para resolverlo. */
  tools: string[];
  /** Los pasos, en orden, para resolverlo y reportar el resultado. */
  steps: string[];
  /** Lo propio de la fuente: fingerprint, payload, idempotencyKey, acciones… */
  payload: Record<string, unknown>;
};

export type WorkSourceStatus = {
  source: WorkSource;
  available: boolean;
  /** Por qué no se pudo leer: permiso, plugin apagado o error. */
  skipped: string | null;
  count: number;
};

export type UnifiedWorkQueue = {
  generatedAt: string;
  /** Lo que hay dentro de la ventana consultada, ya filtrado. */
  total: number;
  /** Lo que efectivamente vuelve en `items` (acotado por `limit`). */
  returned: number;
  /** `true` si quedaron ítems afuera por `limit`. */
  truncated: boolean;
  counts: {
    bySource: Record<WorkSource, number>;
    byApproval: Record<WorkApproval, number>;
    byKind: Record<string, number>;
  };
  sources: WorkSourceStatus[];
  items: UnifiedWorkItem[];
  rules: string[];
};
