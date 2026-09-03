'use client';

import { useMemo, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Sparkles, Undo2 } from 'lucide-react';
import { resolveBwIcon, resolveBwTone, resolveBwFontFamily } from '../shared/tokens';
import { BwViewRenderer } from './BwViewRenderer';
import { BoardContext, type BwBoardContextValue } from './BoardContext';
import type { BwCollectionsData, BwMutateCollection } from './BwBlockRenderer';
import { BW_BUILTIN_TAB_LABELS, type BwBuiltinTab, type BwMenuItem, type BwThemeDefinition } from '../shared/schema';

type Selection = { kind: 'builtin'; tab: BwBuiltinTab } | { kind: 'custom'; viewId: string };

function rootStyleFor(definition: BwThemeDefinition, fallback: CSSProperties): CSSProperties {
  const background = definition.appearance?.background;
  const backgroundStyle: CSSProperties = !background
    ? fallback
    : background.type === 'color'
      ? { backgroundColor: background.color }
      : background.type === 'gradient'
        ? { backgroundImage: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})` }
        : { backgroundImage: `url("${background.url}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  const fontFamily = resolveBwFontFamily(definition.appearance?.fontFamily);
  return fontFamily ? { ...backgroundStyle, fontFamily } : backgroundStyle;
}

/**
 * Shell del tema "custom": header/menú armados desde `definition.menu` y
 * `definition.layout` (orden/etiqueta/ícono/visibilidad/posición los define
 * un conector) en vez de la lista fija `TABS` de la UI clásica. Las 12 vistas
 * clásicas se siguen renderizando TAL CUAL a través de `tabContent` (ya
 * armado por el componente raíz) — acá sólo cambia el menú y el fondo; las
 * vistas custom nuevas se arman con bloques.
 */
export function BusinessThemeShell({
  definition,
  activeTab,
  setActiveTab,
  tabContent,
  data,
  onMutate,
  appRef,
  backgroundStyle,
  onSwitchToClassic,
  boardContext,
  overlay,
}: {
  definition: BwThemeDefinition;
  activeTab: BwBuiltinTab;
  setActiveTab: (tab: BwBuiltinTab) => void;
  tabContent: ReactNode;
  data: BwCollectionsData;
  onMutate: BwMutateCollection;
  appRef: RefObject<HTMLDivElement | null>;
  backgroundStyle: CSSProperties;
  onSwitchToClassic: () => void;
  /** Datos/mutadores del tablero de tareas clásico, para el bloque `kanban`
   * (ver `BoardContext.tsx`). null si por algún motivo no hay proyecto
   * seleccionado todavía — el bloque kanban simplemente no renderiza nada. */
  boardContext: BwBoardContextValue | null;
  /** La ficha de tarea (`BusinessWomanTaskModal`), computada en `index.tsx` y
   * pasada acá como portal — abre igual sea que la dispare una vista clásica
   * reusada (`tabContent`) o el bloque `kanban` de una vista custom. */
  overlay?: ReactNode;
}) {
  const menuItems = useMemo(
    () => [...definition.menu].filter((item) => item.visible).sort((a, b) => a.order - b.order),
    [definition.menu],
  );
  const [customViewId, setCustomViewId] = useState<string | null>(null);
  const selection: Selection = customViewId ? { kind: 'custom', viewId: customViewId } : { kind: 'builtin', tab: activeTab };
  const activeView = selection.kind === 'custom' ? definition.views.find((view) => view.id === selection.viewId) : null;
  const rootStyle = rootStyleFor(definition, backgroundStyle);
  const menuPlacement = definition.layout?.menuPlacement ?? 'top';

  function selectItem(item: BwMenuItem) {
    if (item.kind === 'builtin') {
      setCustomViewId(null);
      setActiveTab(item.tab);
    } else {
      setCustomViewId(item.viewId);
    }
  }

  function isActive(item: BwMenuItem) {
    return item.kind === 'builtin'
      ? selection.kind === 'builtin' && selection.tab === item.tab
      : selection.kind === 'custom' && selection.viewId === item.viewId;
  }

  const brand = (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-pink-600 shadow-sm">
        <Sparkles className="h-4.5 w-4.5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black leading-tight text-zinc-900">{definition.name}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">Tema personalizado</p>
      </div>
    </div>
  );

  const classicButton = (
    <button
      type="button"
      onClick={onSwitchToClassic}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-500 transition hover:border-rose-200 hover:text-rose-600"
      title="Volver al tema clásico"
    >
      <Undo2 className="h-3.5 w-3.5" />
      Tema clásico
    </button>
  );

  // `min-h-0` en TODA la cadena de flex es a propósito: por default un flex
  // item no se achica por debajo del tamaño de su contenido (min-height:auto),
  // así que sin esto el `overflow-y-auto` de acá abajo nunca llega a activarse
  // en iOS/Android — la página "crece" en vez de scrollear adentro de su
  // propio contenedor, y en un layout con header sticky el contenido queda
  // tapado o inalcanzable. Es la causa más común de "no puedo bajar/pasar de
  // pantalla en el celular" en layouts flex anidados.
  const content = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {activeView ? <BwViewRenderer view={activeView} data={data} onMutate={onMutate} onNavigate={setCustomViewId} /> : tabContent}
    </div>
  );

  if (menuPlacement === 'left') {
    return (
      <BoardContext.Provider value={boardContext}>
        <div ref={appRef} className="flex h-full min-h-screen flex-col text-zinc-950 md:flex-row" style={rootStyle}>
          {/* Sidebar vertical de escritorio */}
          <aside className="hidden shrink-0 flex-col border-r border-zinc-200/70 bg-white/85 backdrop-blur-xl md:flex md:w-60">
            <div className="border-b border-zinc-200/70 p-4">{brand}</div>
            <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
              {menuItems.map((item) => (
                <NavButton key={item.id} item={item} active={isActive(item)} vertical onClick={() => selectItem(item)} />
              ))}
            </nav>
            <div className="border-t border-zinc-200/70 p-3">{classicButton}</div>
          </aside>

          {/* Header horizontal compacto para móvil (el sidebar sólo aparece md+) */}
          <header className="sticky top-0 z-30 shrink-0 border-b border-zinc-200/70 bg-white/85 backdrop-blur-xl md:hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              {brand}
              {classicButton}
            </div>
            <nav className="flex gap-1.5 overflow-x-auto px-4 pb-3">
              {menuItems.map((item) => (
                <NavButton key={item.id} item={item} active={isActive(item)} onClick={() => selectItem(item)} />
              ))}
            </nav>
          </header>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{content}</div>
          {overlay}
        </div>
      </BoardContext.Provider>
    );
  }

  return (
    <BoardContext.Provider value={boardContext}>
      <div ref={appRef} className="flex h-full min-h-screen flex-col text-zinc-950" style={rootStyle}>
        <header className="sticky top-0 z-30 shrink-0 border-b border-zinc-200/70 bg-white/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            {brand}
            {classicButton}
          </div>
          <nav className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 pb-3">
            {menuItems.map((item) => (
              <NavButton key={item.id} item={item} active={isActive(item)} onClick={() => selectItem(item)} />
            ))}
          </nav>
        </header>
        {content}
        {overlay}
      </div>
    </BoardContext.Provider>
  );
}

function NavButton({ item, active, vertical, onClick }: { item: BwMenuItem; active: boolean; vertical?: boolean; onClick: () => void }) {
  const Icon = resolveBwIcon(item.icon ?? 'Sparkles');
  const tone = resolveBwTone('rose');
  const label = item.label ?? (item.kind === 'builtin' ? BW_BUILTIN_TAB_LABELS[item.tab] : '');
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
        vertical ? 'w-full justify-start rounded-xl' : ''
      } ${active ? tone.solid + ' border-transparent shadow-sm' : 'border-zinc-200 text-zinc-500 hover:border-rose-200 hover:text-rose-600'}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
