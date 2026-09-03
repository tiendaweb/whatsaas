/**
 * Vocabulario visual de la pantalla Hoy, tomado de Tareas OS.
 *
 * Tareas OS tiene una gramática propia —esquinas muy redondeadas, rótulos
 * diminutos en versalitas negras, números enormes— que hace que un tablero se
 * lea de un vistazo. Hoy era el mismo dato en cajas de 12 px todas iguales.
 *
 * Lo que NO se copia son sus variables (`--t-surface`, `--tareas-accent`):
 * viven bajo `.tareas-ui` y acá no existen, así que la pantalla saldría blanca
 * sobre blanco en modo oscuro. Se usan los tokens del Command Center con las
 * formas de Tareas OS.
 */
export const CH = {
  /** Superficie base de todos los bloques. */
  card: 'rounded-3xl border border-border bg-card',
  /** Rótulo en versalitas: el que va arriba de cada número. */
  rotulo: 'text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground',
  numero: 'text-3xl font-black tabular-nums leading-none tracking-tight text-foreground',
  titulo: 'text-base font-black tracking-tight text-foreground',
  /** Cuadradito de color que lleva el ícono de cada bloque. */
  iconoCaja: 'flex size-10 shrink-0 items-center justify-center rounded-2xl',
  chip: 'inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-2 py-1 text-[11px] font-bold text-muted-foreground',
};

/** Tonos de los cuadraditos. Literales completos: Tailwind no ve clases armadas. */
export const TONOS = {
  indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300',
  sky: 'bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300',
  rose: 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300',
  violet: 'bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300',
  slate: 'bg-muted text-muted-foreground',
} as const;

export type Tono = keyof typeof TONOS;
