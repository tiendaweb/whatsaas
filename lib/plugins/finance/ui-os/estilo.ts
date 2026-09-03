/**
 * Vocabulario visual de Finanzas OS, tomado de Tareas OS (vía el precedente de
 * sales-ops/ui/hoy/estilo.ts): esquinas muy redondeadas, rótulos diminutos en
 * versalitas negras, números enormes. NO se copian las variables `--t-*` de
 * `.tareas-ui` (no existen fuera de ese árbol): se usan los tokens del tema.
 */
export const F = {
  card: 'rounded-3xl border border-border bg-card',
  rotulo: 'text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground',
  numero: 'text-2xl font-black tabular-nums leading-none tracking-tight text-foreground',
  numeroXl: 'text-3xl font-black tabular-nums leading-none tracking-tight text-foreground',
  titulo: 'text-base font-black tracking-tight text-foreground',
  iconoCaja: 'flex size-10 shrink-0 items-center justify-center rounded-2xl',
  chip: 'inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-2 py-1 text-[11px] font-bold text-muted-foreground',
  navItem: 'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition-colors',
  navIdle: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  navActive: 'bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
  input: 'h-9 rounded-2xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40',
  select: 'h-9 rounded-2xl border border-border bg-background px-2 text-xs font-bold outline-none',
  btn: 'inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-black transition-colors',
  btnPrimario: 'bg-emerald-600 text-white hover:bg-emerald-700',
  btnSuave: 'border border-border bg-card text-foreground hover:bg-muted',
};

export const TONOS = {
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300',
  rose: 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300',
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300',
  sky: 'bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300',
  violet: 'bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300',
  indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300',
  slate: 'bg-muted text-muted-foreground',
} as const;

export type Tono = keyof typeof TONOS;
