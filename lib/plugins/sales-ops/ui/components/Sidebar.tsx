'use client';

import { ArrowLeft, BarChart, Brush, Building2, CalendarClock, ChevronsLeft, ChevronsRight, CircleHelp, Coins, Factory, FlaskConical, Inbox, LayoutList, ListChecks, Mic, Radar, Sparkles, Sun, Wand2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OwnerFilter, type OwnerFilterValue } from './OwnerFilter';
import { VISTAS_VISIBLES, VISTA_LABELS, type Vista } from './vistas';
import { fmtInt, iniciales } from './format';

export const VISTA_ICONS: Record<Vista, LucideIcon> = {
  hoy: Sun,
  dinero: Coins,
  oportunidades: Sparkles,
  barrido: Brush,
  limpieza: ListChecks,
  respuestas: Radar,
  cola: Inbox,
  audios: Mic,
  programados: CalendarClock,
  produccion: Factory,
  todos: LayoutList,
  experimentos: FlaskConical,
  clientes: Building2,
  prompts: Wand2,
  metricas: BarChart,
  ayuda: CircleHelp,
};

export type SidebarUser = { name: string | null; email: string | null } | null;

export type SidebarProps = {
  vista: Vista;
  counts: Partial<Record<Vista, number>>;
  owner: OwnerFilterValue;
  user: SidebarUser;
  collapsed?: boolean;
  onNav: (v: Vista) => void;
  onOwner: (v: OwnerFilterValue) => void;
  onToggleCollapse?: () => void;
  className?: string;
};

/**
 * Rail izquierdo del Command Center. Minimalista y operativo: sin sombras ni
 * gradientes; la jerarquía la hacen el peso tipográfico y el espacio.
 */
export function Sidebar({ vista, counts, owner, user, collapsed, onNav, onOwner, onToggleCollapse, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-[232px]',
        className,
      )}
      aria-label="Navegación del Command Center"
    >
      <div className={cn('flex items-center gap-2.5 px-3 pt-4 pb-3', collapsed && 'justify-center px-0')}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Radar className="size-4" aria-hidden />
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">Command Center</span>
            <span className="block truncate text-[11px] leading-tight text-muted-foreground">Comercial</span>
          </span>
        )}
      </div>

      {!collapsed && (
        <div className="px-3 pb-3">
          <OwnerFilter value={owner} onChange={onOwner} />
        </div>
      )}

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
        {VISTAS_VISIBLES.map((v) => {
          const Icon = VISTA_ICONS[v];
          const active = vista === v;
          const n = counts[v];
          return (
            <button
              key={v}
              type="button"
              onClick={() => onNav(v)}
              title={VISTA_LABELS[v]}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                active ? 'bg-muted font-semibold text-foreground' : 'font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                collapsed && 'justify-center px-0',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate">{VISTA_LABELS[v]}</span>
                  {typeof n === 'number' && n > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{fmtInt(n)}</span>}
                </>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1 border-t border-border p-2">
        {/* Tres atajos verticales, como el pie de Tareas OS: plegar, volver al
            lanzador de apps y la ayuda. Plegado, quedan uno debajo del otro. */}
        <div className={cn('grid gap-1', collapsed ? 'grid-cols-1' : 'grid-cols-4')}>
          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={cn('hidden flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold text-muted-foreground hover:bg-muted/60 hover:text-foreground lg:flex')}
              aria-label={collapsed ? 'Expandir navegación' : 'Plegar navegación'}
              title={collapsed ? 'Expandir' : 'Plegar'}
            >
              {collapsed ? <ChevronsRight className="size-[18px]" aria-hidden /> : <ChevronsLeft className="size-[18px]" aria-hidden />}
              {!collapsed && 'Plegar'}
            </button>
          ) : (
            <span className="hidden lg:block" aria-hidden />
          )}
          <a
            href="/apps"
            className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            title="Volver a WhatsPro"
          >
            <ArrowLeft className="size-[18px]" aria-hidden />
            {!collapsed && 'WhatsPro'}
          </a>
          {/* Tareas OS y el Command Center se usan a la par: ir de uno a otro no
              debería pasar por el lanzador de apps. */}
          <a
            href="/plugins/tasks"
            className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            title="Ir a Tareas OS"
          >
            <ListChecks className="size-[18px]" aria-hidden />
            {!collapsed && 'Tareas'}
          </a>
          <button
            type="button"
            onClick={() => onNav('ayuda')}
            aria-pressed={vista === 'ayuda'}
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold hover:bg-muted/60',
              vista === 'ayuda' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            title="Ayuda: cómo funciona el Command Center"
          >
            <CircleHelp className="size-[18px]" aria-hidden />
            {!collapsed && 'Ayuda'}
          </button>
        </div>
        <div className={cn('flex items-center gap-2.5 px-2.5 py-2', collapsed && 'justify-center px-0')}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
            {iniciales(user?.name || user?.email || '?')}
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{user?.name || user?.email || '—'}</span>
              {user?.name && user.email && <span className="block truncate text-[10px] text-muted-foreground">{user.email}</span>}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

const MOBILE_TABS: Vista[] = ['hoy', 'dinero', 'respuestas', 'cola'];

/** Barra inferior propia (móvil): 4 accesos + "Más" que abre el drawer. */
export function MobileBar({ vista, counts, onNav, onMore }: { vista: Vista; counts: Partial<Record<Vista, number>>; onNav: (v: Vista) => void; onMore: () => void }) {
  const moreActive = !MOBILE_TABS.includes(vista);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Accesos rápidos"
    >
      {MOBILE_TABS.map((v) => {
        const Icon = VISTA_ICONS[v];
        const active = vista === v;
        const n = counts[v];
        return (
          <button
            key={v}
            type="button"
            onClick={() => onNav(v)}
            aria-current={active ? 'page' : undefined}
            className={cn('relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium', active ? 'text-foreground' : 'text-muted-foreground')}
          >
            <Icon className="size-5" aria-hidden />
            {VISTA_LABELS[v]}
            {typeof n === 'number' && n > 0 && (
              <span className="absolute right-[18%] top-1 rounded-full bg-foreground px-1 text-[9px] font-semibold tabular-nums text-background">{n > 99 ? '99+' : n}</span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className={cn('flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium', moreActive ? 'text-foreground' : 'text-muted-foreground')}
        aria-label="Más vistas"
      >
        <LayoutList className="size-5" aria-hidden />
        Más
      </button>
    </nav>
  );
}
