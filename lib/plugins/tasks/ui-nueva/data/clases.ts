export const C = {
  rotulo: 'text-[10px] uppercase font-black tracking-[0.2em] text-[var(--t-muted)]',
  nav: 'w-full group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200',
  navIdle: 'text-[var(--t-text-secondary)] hover:bg-[var(--t-hover)] hover:text-[var(--t-text)] font-medium',
  navActive: 'font-semibold text-[var(--tareas-accent)] bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)]',
  badge:
    'text-[10px] px-2 py-0.5 rounded-md font-bold bg-[var(--t-chip)] text-[var(--t-text-secondary)] group-hover:bg-[var(--t-hover)]',
  iconBtn:
    'p-3 rounded-xl transition-all text-[var(--t-muted)] hover:bg-[var(--t-hover)]',
  iconBtnActive: 'bg-[var(--tareas-accent)] text-white hover:bg-[var(--tareas-accent)]',
  card: 'bg-[var(--t-surface)] rounded-3xl border border-[var(--t-border)]',
  search:
    'w-full bg-[var(--t-surface)] border border-[var(--t-border)] rounded-3xl py-5 pl-14 pr-4 outline-none focus:ring-4 focus:ring-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)] focus:border-[var(--tareas-accent)] transition-all text-sm font-bold shadow-sm text-[var(--t-text)] placeholder:text-[var(--t-muted)]',
  chip:
    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-bold border-[var(--t-border)] bg-[var(--t-surface-2)] text-[var(--t-text-secondary)] hover:border-[var(--t-border-2)]',
  control: 'bg-[var(--t-surface-2)] rounded-2xl px-4 py-3 text-sm font-bold text-[var(--t-text)] outline-none w-full',
  overlay: 'fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4',
};
