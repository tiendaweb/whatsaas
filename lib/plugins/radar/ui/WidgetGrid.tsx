'use client';

import { useState } from 'react';
import {
  Archive, Check, ChevronDown, EyeOff, GripVertical, Loader2, Maximize2,
  Minimize2, Pencil,
} from 'lucide-react';
import type { RadarWidget, RadarWidgetSize } from '@/lib/plugins/radar/shared/blocks';
import { RADAR_WIDGET_SIZES } from '@/lib/plugins/radar/shared/blocks';
import { RadarBlocks } from './blocks/RadarBlockView';
import { BlockEmpty, resolveIcon, toneClasses } from './blocks/primitives';
import { inferRadarIcon } from '@/lib/plugins/radar/shared/icon-semantics';

/**
 * Ancho en la grilla de 12 columnas. Los strings son literales completos a
 * propósito: Tailwind v4 no genera clases armadas por concatenación.
 * En móvil TODOS los widgets ocupan el ancho completo — no hay tamaño chico
 * que se lea bien en un teléfono.
 */
const SPAN_CLASS: Record<RadarWidgetSize, string> = {
  xs: 'md:col-span-3',
  sm: 'md:col-span-4',
  md: 'md:col-span-6',
  lg: 'md:col-span-8',
  full: 'md:col-span-12',
};

const SIZE_LABEL: Record<RadarWidgetSize, string> = {
  xs: 'Mini · 4 por fila',
  sm: 'Chico · 3 por fila',
  md: 'Medio · 2 por fila',
  lg: 'Grande · ⅔ del ancho',
  full: 'Ancho completo',
};

export type WidgetMutations = {
  onResize: (key: string, size: RadarWidgetSize) => void | Promise<void>;
  onToggle: (key: string, enabled: boolean) => void | Promise<void>;
  /** Manda el widget al banco. Ya no borra nada: se puede restaurar. */
  onArchive: (key: string) => void | Promise<void>;
  onMove: (key: string, direction: -1 | 1) => void | Promise<void>;
};

export function WidgetGrid({
  widgets,
  editing,
  mutations,
  onSelectContact,
  emptyText = 'Todavía no hay widgets en esta sección.',
}: {
  widgets: RadarWidget[];
  editing: boolean;
  mutations?: WidgetMutations;
  onSelectContact?: (contactId: number) => void;
  emptyText?: string;
}) {
  const visible = editing ? widgets : widgets.filter((widget) => widget.enabled);

  if (!visible.length) {
    return (
      <div className="rounded-3xl border border-dashed border-neutral-200 dark:border-neutral-700">
        <BlockEmpty text={emptyText} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      {visible.map((widget) => (
        <div key={widget.key} className={SPAN_CLASS[widget.size] ?? SPAN_CLASS.md}>
          <WidgetCard
            widget={widget}
            editing={editing}
            mutations={mutations}
            onSelectContact={onSelectContact}
          />
        </div>
      ))}
    </div>
  );
}

function WidgetCard({
  widget,
  editing,
  mutations,
  onSelectContact,
}: {
  widget: RadarWidget;
  editing: boolean;
  mutations?: WidgetMutations;
  onSelectContact?: (contactId: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Widgets viejos sin icono guardado: capas (contenido apilado), no Sparkles.
  const Icon = resolveIcon(widget.icon, inferRadarIcon([widget.title, widget.description], 'Layers'));
  const tone = toneClasses(widget.tone);

  async function run(action?: () => void | Promise<void>) {
    if (!action) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  return (
    <section
      className={`flex h-full flex-col rounded-3xl border bg-white transition-all duration-200 dark:bg-neutral-800/60 ${
        widget.enabled ? 'border-neutral-100 dark:border-neutral-800' : 'border-dashed border-neutral-300 opacity-60 dark:border-neutral-600'
      }`}
      aria-label={widget.title}
    >
      <header className="flex items-start gap-2.5 px-4 pt-4">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${tone.soft}`}>
          <Icon className="h-4 w-4" />
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={!collapsed}
        >
          <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">{widget.title}</p>
          {widget.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">{widget.description}</p>
          )}
        </button>

        {editing && mutations ? (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
              aria-label={`Opciones de ${widget.title}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-9 z-20 w-56 rounded-2xl border border-neutral-100 bg-white p-1.5 shadow-xl dark:border-neutral-700 dark:bg-neutral-800"
              >
                <p className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Tamaño</p>
                {RADAR_WIDGET_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="menuitem"
                    onClick={() => void run(() => mutations.onResize(widget.key, size))}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-neutral-600 transition-all duration-200 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  >
                    {size === 'full' ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
                    <span className="flex-1">{SIZE_LABEL[size]}</span>
                    {widget.size === size && <Check className="h-3.5 w-3.5 text-indigo-500" />}
                  </button>
                ))}

                <div className="my-1 border-t border-neutral-100 dark:border-neutral-700" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void run(() => mutations.onMove(widget.key, -1))}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-neutral-600 transition-all duration-200 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <GripVertical className="h-3.5 w-3.5" /> Subir
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void run(() => mutations.onMove(widget.key, 1))}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-neutral-600 transition-all duration-200 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <GripVertical className="h-3.5 w-3.5 rotate-180" /> Bajar
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void run(() => mutations.onToggle(widget.key, !widget.enabled))}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-neutral-600 transition-all duration-200 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <EyeOff className="h-3.5 w-3.5" /> {widget.enabled ? 'Ocultar' : 'Mostrar'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void run(() => mutations.onArchive(widget.key))}
                  title="Se guarda en el banco: podés restaurarlo o duplicarlo cuando quieras"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-neutral-600 transition-all duration-200 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <Archive className="h-3.5 w-3.5" /> Guardar en el banco
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-neutral-300 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-600 dark:hover:bg-neutral-800"
            aria-label={collapsed ? 'Expandir' : 'Contraer'}
          >
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} />
          </button>
        )}
      </header>

      {!collapsed && (
        <div className="min-w-0 flex-1 p-4">
          {widget.blocks.length ? (
            <RadarBlocks blocks={widget.blocks} onSelectContact={onSelectContact} />
          ) : (
            <BlockEmpty text="Este widget todavía no tiene bloques." />
          )}
        </div>
      )}
    </section>
  );
}
