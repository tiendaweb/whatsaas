/** Clases compartidas del Calendario, en tokens (ver calendario.css). */
export const C = {
  rotulo: 'text-[10px] uppercase font-black tracking-[0.2em] text-[var(--c-muted)]',
  nav: 'w-full group flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200',
  navIdle: 'text-[var(--c-text-secondary)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text)] font-medium',
  navActive: 'font-semibold text-[var(--cal-accent)] bg-[color-mix(in_srgb,var(--cal-accent)_10%,transparent)]',
  badge: 'text-[10px] px-2 py-0.5 rounded-md font-bold bg-[var(--c-chip)] text-[var(--c-text-secondary)]',
  iconBtn: 'rounded-xl p-2.5 transition-all text-[var(--c-muted)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]',
  iconBtnActive: 'bg-[var(--cal-accent)] text-white hover:bg-[var(--cal-accent)] hover:text-white',
  card: 'bg-[var(--c-surface)] rounded-2xl border border-[var(--c-border)]',
  control: 'bg-[var(--c-surface-2)] border border-[var(--c-border)] rounded-xl px-3 py-2 text-sm text-[var(--c-text)] outline-none focus:border-[var(--cal-accent)] w-full',
  chip: 'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors',
  chipIdle: 'border-[var(--c-border-2)] text-[var(--c-text-secondary)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]',
  chipActive: 'border-transparent bg-[var(--c-text)] text-[var(--c-bg)]',
  overlay: 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 backdrop-blur-sm sm:p-4',
};
