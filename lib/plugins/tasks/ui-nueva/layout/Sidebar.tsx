'use client';

import {
  ArrowLeft,
  BarChart,
  Building2,
  Check,
  ChevronDown,
  Home,
  IdCard,
  LayoutGrid,
  Archive,
  MoreHorizontal,
  Radar,
  Settings,
  Sparkles,
  Target,
  Factory,
  Trash2,
} from 'lucide-react';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import { cn } from '@/lib/utils';
import { C } from '../data/clases';
import { esProyectoEjemplo } from '../data/universo';
import type { GrupoProyecto, NavId } from '../data/tipos';
import { ES } from '../i18n/es';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type WorkspaceLite = { id: number; name: string; aiPrompt?: string; color?: string | null; icon?: string | null };

export function Sidebar(props: {
  nav: NavId;
  onNav: (nav: NavId) => void;
  contadores: { bandeja: number; vencidas: number };
  workspaces: WorkspaceLite[];
  grupos: GrupoProyecto[];
  workspaceId: number | null;
  projectIds: number[] | null;
  onEspacio: (workspaceId: number | null, projectIds: number[] | null) => void;
  onEditarPromptEspacio: (workspaceId: number) => void;
  onEditarPromptProyecto: (projectId: number) => void;
  onArchivarCliente: (projectId: number) => void;
  onArchivarProyecto: (projectId: number) => void;
  onEliminarProyecto: (projectId: number) => void;
  onAbrirCliente: (customerId: number) => void;
  onVolver: () => void;
  /** Ancho en px (escritorio). El drawer móvil no lo usa. */
  width?: number;
  /** Arrastre del borde derecho para cambiar el ancho. */
  onResize?: (width: number) => void;
  onEliminarEspacio?: (workspaceId: number) => void;
  onVolverCommandCenter?: () => void;
  className?: string;
}) {
  const actual = props.workspaces.find((ws) => ws.id === props.workspaceId) ?? null;
  const enClientes = actual?.name.trim().toLocaleLowerCase('es') === 'clientes';
  const WsIcon = resolveTaskIcon(actual?.icon) ?? Building2;
  const proyectos = props.grupos.filter((grupo) => {
    if (esProyectoEjemplo(grupo.name)) return false;
    if (props.workspaceId && grupo.workspaceId !== props.workspaceId) return false;
    if (grupo.workspaceNombre.trim().toLocaleLowerCase('es') === 'clientes') {
      if (grupo.totalTasks === 0 || grupo.customerStatus === 'archived') return false;
    }
    return true;
  });

  /**
   * Acceso compacto del pie: icono arriba, texto abajo. Los tres entran en una
   * fila, así que el pie pasa de tres renglones a uno.
   */
  const atajo = (id: NavId, icon: React.ReactNode, label: string) => {
    const active = props.nav === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => props.onNav(id)}
        title={label}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 transition-all duration-200',
          active ? C.navActive : C.navIdle,
        )}
      >
        <span className={cn(active ? 'text-[var(--tareas-accent)]' : '')}>{icon}</span>
        <span className="text-[11px] font-semibold leading-none truncate max-w-full">{label}</span>
      </button>
    );
  };

  const item = (id: NavId, icon: React.ReactNode, label: string, badge?: number, danger = false) => {
    const active = props.nav === id;
    return (
      <button
        type="button"
        onClick={() => props.onNav(id)}
        className={cn(C.nav, active ? C.navActive : C.navIdle, danger && !active && 'text-rose-500')}
      >
        <span className="flex items-center gap-3">
          <span className={cn(active ? 'text-[var(--tareas-accent)]' : danger ? 'text-rose-500' : '')}>{icon}</span>
          {label}
        </span>
        {!!badge && badge > 0 && <span className={C.badge}>{badge}</span>}
      </button>
    );
  };

  return (
    <aside
      className={cn('relative flex h-full shrink-0 flex-col border-r border-[var(--t-border)] bg-[var(--t-surface)]', !props.width && 'w-64', props.className)}
      style={props.width ? { width: props.width } : undefined}
    >
      {/* Borde arrastrable: el ancho fijo no alcanzaba para los nombres largos
          de proyecto y cada quien necesita otro. Se guarda en las preferencias. */}
      {props.onResize && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Cambiar el ancho del panel"
          onMouseDown={(event) => {
            event.preventDefault();
            const inicio = event.clientX;
            const base = props.width ?? 300;
            const mover = (e: MouseEvent) => props.onResize!(Math.min(Math.max(base + (e.clientX - inicio), 220), 520));
            const soltar = () => {
              window.removeEventListener('mousemove', mover);
              window.removeEventListener('mouseup', soltar);
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
            };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', mover);
            window.addEventListener('mouseup', soltar);
          }}
          onDoubleClick={() => props.onResize!(300)}
          className="absolute right-0 top-0 z-10 hidden h-full w-1.5 cursor-col-resize hover:bg-[var(--tareas-accent)]/40 lg:block"
        />
      )}
      <div className="p-6 overflow-y-auto flex-1">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
            style={{ background: 'var(--tareas-accent)', boxShadow: 'var(--t-shadow-accent)' }}
          >
            <LayoutGrid className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-[var(--t-text)] flex-1">{ES.marca}</span>
          {/* Home junto a la marca: es "salir a todos los espacios", no parte del
              selector de espacio, que así se queda con todo el ancho. */}
          <button
            type="button"
            onClick={() => {
              props.onEspacio(null, null);
              props.onNav('espacios');
            }}
            title={ES.nav.todosLosProyectos}
            aria-label={ES.nav.todosLosProyectos}
            className={cn(
              C.iconBtn,
              'shrink-0 p-2.5',
              (props.nav === 'espacios' || (!props.workspaceId && !props.projectIds)) && C.iconBtnActive,
            )}
          >
            <Home className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-8 flex items-stretch gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* El nombre del espacio se lee entero: "2 · Clientes a med…" no le
                  decía a nadie dónde estaba parado. */}
              <button type="button" className={cn(C.nav, C.navIdle, 'min-w-0 flex-1 px-2.5 py-2 items-start')} title={actual?.name ?? ES.metricas.todosLosEspacios}>
                <span className="flex min-w-0 items-start gap-2">
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ background: actual?.color || 'var(--tareas-accent)' }}
                  >
                    <WsIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-col text-left">
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--t-muted)]">{ES.rotulos.espacio}</span>
                    <span className="whitespace-normal break-words leading-snug">{actual?.name ?? ES.metricas.todosLosEspacios}</span>
                  </span>
                </span>
                <ChevronDown className="mt-1 h-4 w-4 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="start" className="w-56">
              <DropdownMenuItem onSelect={() => props.onEspacio(null, null)} className="gap-2">
                <Home className="h-4 w-4" />
                <span className="flex-1">{ES.metricas.todosLosEspacios}</span>
                {!props.workspaceId && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
              {props.workspaces.map((workspace) => {
                const Icon = resolveTaskIcon(workspace.icon) ?? Building2;
                return (
                  <DropdownMenuItem key={workspace.id} onSelect={() => props.onEspacio(workspace.id, null)} className="gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="flex-1 truncate">{workspace.name}</span>
                    {workspace.id === props.workspaceId && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
              {actual && props.onEliminarEspacio && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => props.onEliminarEspacio!(actual.id)} className="gap-2 text-rose-600 focus:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                    {ES.clientes.espacioEliminar}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {actual ? (
            <button
              type="button"
              onClick={() => props.onEditarPromptEspacio(actual.id)}
              title={ES.ia.editarEspacio}
              aria-label={ES.ia.editarEspacio}
              className={cn(C.iconBtn, 'shrink-0 p-2.5', actual.aiPrompt && 'text-[var(--tareas-accent)]')}
            >
              <Sparkles className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className={cn(C.rotulo, 'mb-3')}>{ES.rotulos.proyectos}</div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => props.onEspacio(props.workspaceId, null)}
            className={cn(C.nav, !props.projectIds ? C.navActive : C.navIdle)}
          >
            <span className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--tareas-accent)]" />
              {ES.nav.todosLosProyectos}
            </span>
          </button>
          {proyectos.map((grupo) => {
            const active = props.projectIds
              && props.projectIds.length === grupo.projectIds.length
              && grupo.projectIds.every((id) => props.projectIds!.includes(id));
            const projectId = grupo.projectIds[0];
            return (
              <div
                key={grupo.key}
                className={cn(C.nav, active ? C.navActive : C.navIdle, 'items-start gap-2')}
              >
                {/* Columna izquierda: el punto de color y, debajo, el prompt del
                    proyecto. Antes el prompt iba a la derecha y le comía el
                    ancho al nombre. */}
                <span className="flex shrink-0 flex-col items-center gap-1 pt-1">
                  <span className="w-2.5 h-2.5 rounded-full shadow-sm shrink-0" style={{ background: grupo.color || '#a3a3a3' }} />
                  <button
                    type="button"
                    onClick={() => props.onEditarPromptProyecto(projectId)}
                    className="rounded-md p-0.5 text-[var(--t-muted)] hover:text-[var(--tareas-accent)]"
                    title={ES.ia.editarProyecto}
                    aria-label={`${ES.ia.editarProyecto}: ${grupo.name}`}
                  >
                    <Sparkles className="h-3 w-3" />
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => props.onEspacio(grupo.workspaceId, grupo.projectIds)}
                  className="flex min-w-0 flex-1 items-start text-left"
                  title={grupo.name}
                >
                  <span className="whitespace-normal break-words leading-snug">{grupo.name}</span>
                </button>
                <span className="flex shrink-0 items-center gap-0.5 pt-0.5">
                  {grupo.projectIds.length > 1 && <span className={C.badge}>{grupo.projectIds.length}</span>}
                  {grupo.customerId && (
                    <button
                      type="button"
                      onClick={() => props.onAbrirCliente(grupo.customerId!)}
                      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black uppercase tracking-wide bg-[color-mix(in_srgb,var(--tareas-accent)_14%,transparent)] text-[var(--tareas-accent)] hover:bg-[color-mix(in_srgb,var(--tareas-accent)_22%,transparent)]"
                      title={ES.relaciones.abrirFicha}
                      aria-label={ES.relaciones.abrirFicha}
                    >
                      <IdCard className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="rounded-lg p-1 text-[var(--t-muted)] hover:bg-[var(--t-bg)] hover:text-[var(--t-text)]"
                        title={ES.clientes.proyectoMas}
                        aria-label={`${ES.clientes.proyectoMas}: ${grupo.name}`}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="bottom" align="end" className="w-52">
                      <DropdownMenuItem onSelect={() => props.onEditarPromptProyecto(projectId)} className="gap-2">
                        <Sparkles className="h-4 w-4" />
                        {ES.ia.editarProyecto}
                      </DropdownMenuItem>
                      {enClientes && grupo.totalTasks > 0 && grupo.activeTasks === 0 && grupo.customerId ? (
                        <DropdownMenuItem onSelect={() => props.onArchivarCliente(projectId)} className="gap-2">
                          <Archive className="h-4 w-4" />
                          {ES.clientes.archivar}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => props.onArchivarProyecto(projectId)} className="gap-2">
                          <Archive className="h-4 w-4" />
                          {ES.clientes.proyectoArchivar}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => props.onEliminarProyecto(projectId)} className="gap-2 text-rose-600 focus:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                        {ES.clientes.proyectoEliminar}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            );
          })}
        </div>

      </div>

      <div className="mt-auto p-4 space-y-1.5 border-t border-[var(--t-border)]">
        <div className="grid grid-cols-4 gap-1.5">
          {atajo('enfoque', <Target className="w-[18px] h-[18px]" />, ES.nav.enfoque)}
          {atajo('produccion', <Factory className="w-[18px] h-[18px]" />, ES.nav.produccion)}
          {atajo('metricas', <BarChart className="w-[18px] h-[18px]" />, ES.nav.metricas)}
          {atajo('ajustes', <Settings className="w-[18px] h-[18px]" />, ES.nav.ajustes)}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={props.onVolver}
            className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-medium text-[var(--t-muted)] hover:text-[var(--t-text)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {ES.volver}
          </button>
          <a
            href="/plugins/sales-ops"
            className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-medium text-[var(--t-muted)] hover:text-[var(--t-text)]"
            title={ES.volverCommandCenter}
          >
            <Radar className="w-3.5 h-3.5" />
            {ES.volverCommandCenterCorto}
          </a>
        </div>
      </div>
    </aside>
  );
}
