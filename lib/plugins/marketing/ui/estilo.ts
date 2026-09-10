/**
 * Vocabulario visual de Marketing: el mismo de Empresa y del Command Center.
 *
 * Se copia y no se importa a propósito. `sales-ops/ui/hoy/estilo.ts` es el
 * vocabulario de ESA app; si Marketing lo importara, cualquier ajuste fino de una
 * pantalla del Command Center se metería sin aviso en la otra. Son dos
 * aplicaciones que hoy comparten gramática, no un design system compartido.
 *
 * La gramática, resumida: una superficie (`card`), tres pesos tipográficos
 * —medio para lo que se lee, semibold para lo que rotula, bold para lo que se
 * mira—, un radio por nivel de anidamiento y color sólo donde hay que mirar.
 */
export const CH = {
  /** Superficie base de todos los bloques. */
  card: 'rounded-2xl border border-border bg-card',
  /** Rótulo en versalitas: el que va arriba de cada número. */
  rotulo: 'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground',
  numero: 'text-3xl font-bold tabular-nums leading-none tracking-tight text-foreground',
  numeroChico: 'text-2xl font-bold tabular-nums leading-none tracking-tight text-foreground',
  titulo: 'text-base font-bold tracking-tight text-foreground',
  /** Cuadradito que lleva el ícono de cada bloque. */
  iconoCaja: 'flex size-10 shrink-0 items-center justify-center rounded-lg',
  chip: 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2 py-1 text-[11px] font-medium text-muted-foreground',
  /** Aclaración bajo un dato. Un solo tamaño para todo lo secundario. */
  ayuda: 'text-[11px] text-muted-foreground',
};

/**
 * Tonos de los cuadraditos. Literales completos: Tailwind no ve clases armadas
 * por concatenación y las borraría del CSS final.
 *
 * `slate` es el neutro y es el que llevan los contadores de volumen. Si los
 * ocho bloques llevan color, el color deja de decir "mirá esto" y pasa a ser
 * decoración de categoría.
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
