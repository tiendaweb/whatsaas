/**
 * Vocabulario visual de la pantalla Hoy, tomado de Tareas OS.
 *
 * Tareas OS tiene una gramática propia —esquinas redondeadas, rótulos
 * diminutos en versalitas, números grandes— que hace que un tablero se lea de
 * un vistazo. Hoy era el mismo dato en cajas de 12 px todas iguales.
 *
 * Lo que NO se copia son sus variables (`--t-surface`, `--tareas-accent`):
 * viven bajo `.tareas-ui` y acá no existen, así que la pantalla saldría blanca
 * sobre blanco en modo oscuro. Se usan los tokens del Command Center con las
 * formas de Tareas OS.
 *
 * Sobre el peso tipográfico: antes todo era `font-black`. Los rótulos, los
 * títulos, los números, los botones, los nombres y hasta las aclaraciones.
 * Cuando todo pesa 900 nada pesa, y la pantalla se lee como un bloque parejo
 * de negrita. Ahora hay tres escalones —medio para lo que se lee, semibold
 * para lo que rotula, bold para lo que se mira— y el número es lo único que
 * además crece.
 *
 * Sobre los radios: había tres anidados en un mismo bloque (3xl la tarjeta,
 * 2xl el ícono, xl el chip). Uno por nivel alcanza.
 */
export const CH = {
  /** Superficie base de todos los bloques. */
  card: 'rounded-2xl border border-border bg-card',
  /** Rótulo en versalitas: el que va arriba de cada número. */
  rotulo: 'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground',
  numero: 'text-3xl font-bold tabular-nums leading-none tracking-tight text-foreground',
  /** El número del dato principal de un bloque. */
  numeroChico: 'text-2xl font-bold tabular-nums leading-none tracking-tight text-foreground',
  titulo: 'text-base font-bold tracking-tight text-foreground',
  /** Cuadradito que lleva el ícono de cada bloque. */
  iconoCaja: 'flex size-10 shrink-0 items-center justify-center rounded-lg',
  chip: 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2 py-1 text-[11px] font-medium text-muted-foreground',
  /** Aclaración bajo un dato. Un solo tamaño para todo lo secundario. */
  ayuda: 'text-[11px] text-muted-foreground',
};

/**
 * Tonos de los cuadraditos. Literales completos: Tailwind no ve clases armadas.
 *
 * `slate` es el neutro y es el que corresponde a los contadores de volumen: si
 * los seis bloques llevan color, el color deja de decir "mirá esto" y pasa a
 * ser decoración de categoría.
 */
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
