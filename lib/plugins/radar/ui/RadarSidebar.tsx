'use client';

import { PanelLeftClose, PanelLeftOpen, Radar as RadarIcon, X } from 'lucide-react';
import { resolveIcon, toneClasses } from './blocks/primitives';
import type { RadarTone } from '@/lib/plugins/radar/shared/blocks';
import { inferRadarIcon } from '@/lib/plugins/radar/shared/icon-semantics';

/**
 * Clave de navegación: una sección builtin, el slug de una sección
 * personalizada del equipo, o `banco` (que no es una sección del contrato:
 * es una entrada de navegación más del menú).
 */
export type RadarNavKey = string;

export type RadarNavItem = {
  key: RadarNavKey;
  label: string;
  icon: string;
  tone: RadarTone;
  /** Número grande de la card (contactos analizados, informes, etc.). */
  metric: number | null;
  /** Renglón chico debajo del título. */
  hint: string;
  /** Chip de alerta a la derecha (P1 pendientes, vencidas…). */
  alert?: { label: string; tone: RadarTone } | null;
  /** Separador visual: dibuja el label en versalitas en vez de una card. */
  separator?: boolean;
};

/**
 * Menú lateral de Radar. Cada entrada es una card viva: además del nombre de
 * la sección muestra su número actual y una alerta si hay algo que mirar hoy.
 * Colapsado deja solo los iconos, para que el tablero respire en pantallas
 * chicas de escritorio.
 */
export function RadarSidebar({
  items,
  active,
  collapsed,
  onSelect,
  onToggleCollapse,
  onClose,
  variant = 'desktop',
}: {
  items: RadarNavItem[];
  active: RadarNavKey;
  collapsed: boolean;
  onSelect: (key: RadarNavKey) => void;
  onToggleCollapse: () => void;
  onClose?: () => void;
  variant?: 'desktop' | 'drawer';
}) {
  const isDrawer = variant === 'drawer';
  const showLabels = isDrawer || !collapsed;

  return (
    <div
      className={`flex h-full min-h-0 flex-col border-r border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900 ${
        isDrawer ? 'w-[17rem]' : collapsed ? 'w-[4.5rem]' : 'w-[17rem]'
      } transition-[width] duration-200`}
    >
      <header className={`flex items-center gap-2.5 border-b border-neutral-100 px-3 py-4 dark:border-neutral-800 ${showLabels ? '' : 'justify-center'}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-white shadow-xl shadow-indigo-500/20 dark:shadow-none">
          <RadarIcon className="h-5 w-5" />
        </span>
        {showLabels && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black tracking-tight text-neutral-900 dark:text-white">Radar</p>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">Inteligencia comercial</p>
          </div>
        )}
        {isDrawer ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white ${collapsed ? 'hidden' : ''}`}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </header>

      <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5" aria-label="Secciones de Radar">
        {items.map((item) => {
          if (item.separator) {
            // Colapsado no hay lugar para texto: una línea fina alcanza.
            return showLabels ? (
              <p
                key={item.key}
                className="px-2.5 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500"
              >
                {item.label}
              </p>
            ) : (
              <div key={item.key} className="mx-2 my-2 border-t border-neutral-100 dark:border-neutral-800" />
            );
          }

          const Icon = resolveIcon(item.icon, inferRadarIcon([item.label, item.key], 'Compass'));
          const tone = toneClasses(item.tone);
          const isActive = item.key === active;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              aria-current={isActive ? 'page' : undefined}
              title={showLabels ? undefined : item.label}
              className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-all duration-200 ${
                isActive
                  ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10'
                  : 'border-transparent hover:border-neutral-100 hover:bg-neutral-50 dark:hover:border-neutral-800 dark:hover:bg-neutral-800/60'
              } ${showLabels ? '' : 'justify-center'}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-indigo-500 text-white' : tone.soft}`}>
                <Icon className="h-4 w-4" />
              </span>

              {showLabels && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`truncate text-sm font-bold ${isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-neutral-800 dark:text-neutral-100'}`}>
                        {item.label}
                      </span>
                      {item.alert && (
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ${toneClasses(item.alert.tone).solid}`}>
                          {item.alert.label}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-neutral-400 dark:text-neutral-500">{item.hint}</span>
                  </span>

                  {item.metric !== null && (
                    <span className={`shrink-0 text-lg font-black tabular-nums ${isActive ? 'text-indigo-600 dark:text-indigo-300' : 'text-neutral-300 dark:text-neutral-600'}`}>
                      {item.metric}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {!isDrawer && collapsed && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expandir menú"
          className="m-2.5 flex h-9 items-center justify-center rounded-xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
