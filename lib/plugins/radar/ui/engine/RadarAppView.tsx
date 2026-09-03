'use client';

/**
 * Renderer de una app del RADAR ENGINE.
 *
 * El servidor ya hizo todo el trabajo (datasources, métricas, bindings): acá
 * llega una vista RESUELTA con bloques del contrato de widgets, y esto sólo la
 * dibuja en la grilla de 12 columnas con el mismo chrome que los widgets de
 * Radar. La navegación entre vistas es una fila de pills y la última vista
 * elegida se recuerda por usuario en el user state del engine.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, Check, Loader2, RefreshCw } from 'lucide-react';
import type { RadarTone } from '@/lib/plugins/radar/shared/blocks';
import type {
  RadarAction,
  RadarAppContext,
  RadarAppStatus,
  RadarTheme,
  ResolvedRadarComponent,
  ResolvedRadarNavItem,
  ResolvedRadarView,
} from '@/lib/plugins/radar/shared/engine';
import { buildRadarAppHref } from '@/lib/plugins/radar/shared/app-link';
import { inferRadarIcon } from '@/lib/plugins/radar/shared/icon-semantics';
import { RadarBlocks } from '../blocks/RadarBlockView';
import { BlockEmpty, resolveIcon, toneClasses } from '../blocks/primitives';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { error?: string } | null)?.error ?? `Error ${res.status}`);
  }
  return res.json();
};

type AppResponse = {
  app: {
    slug: string;
    name: string;
    icon: string | null;
    tone: RadarTone | null;
    status: RadarAppStatus;
    version: number;
    publishedVersion: number | null;
    theme: RadarTheme | null;
  };
  navigation: ResolvedRadarNavItem[];
  defaultView: string;
  context: RadarAppContext;
  view: ResolvedRadarView;
};

type StateResponse = { state?: Record<string, unknown> };

/**
 * Ancho md por columnas de grilla. Literales completos a propósito: Tailwind
 * v4 no genera clases armadas por concatenación (`md:col-span-${w}` no existe
 * en el bundle).
 */
const MD_SPAN: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  5: 'md:col-span-5',
  6: 'md:col-span-6',
  7: 'md:col-span-7',
  8: 'md:col-span-8',
  9: 'md:col-span-9',
  10: 'md:col-span-10',
  11: 'md:col-span-11',
  12: 'md:col-span-12',
};

export function RadarAppView({
  slug,
  initialView = null,
  initialContext = {},
}: {
  slug: string;
  initialView?: string | null;
  initialContext?: RadarAppContext;
}) {
  // null = todavía no se eligió nada: el servidor resuelve la vista default.
  const [viewSlug, setViewSlug] = useState<string | null>(initialView);
  const restoredRef = useRef(false);

  // Última vista donde quedó el usuario (user state del engine).
  const { data: savedState } = useSWR<StateResponse>(
    `/api/plugins/radar/state?app=${encodeURIComponent(slug)}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (restoredRef.current || !savedState || initialView) return;
    restoredRef.current = true;
    const last = savedState.state?.lastView;
    if (typeof last === 'string' && last.trim() !== '') {
      setViewSlug((current) => current ?? last);
    }
  }, [initialView, savedState]);

  const appUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (viewSlug) params.set('view', viewSlug);
    if (Object.keys(initialContext).length) params.set('context', JSON.stringify(initialContext));
    const query = params.toString();
    return `/api/plugins/radar/apps/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`;
  }, [initialContext, slug, viewSlug]);

  const { data, error, isLoading, mutate } = useSWR<AppResponse>(appUrl, fetcher, {
    revalidateOnFocus: true,
    keepPreviousData: true,
    refreshInterval: (latest) => ((latest?.view?.refreshSeconds ?? 60) * 1000),
  });

  // Al cambiar de app se resetea la restauración de vista.
  useEffect(() => {
    restoredRef.current = false;
    setViewSlug(initialView);
  }, [initialView, slug]);

  const accent: RadarTone = data?.app.theme?.accent ?? data?.app.tone ?? 'indigo';

  function selectView(next: string) {
    setViewSlug(next);
    // Fire-and-forget: recordar la vista no puede frenar la navegación.
    void fetch('/api/plugins/radar/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: slug, state: { lastView: next } }),
    }).catch(() => undefined);
  }

  if (error && !data) {
    return (
      <div className="rounded-3xl border border-neutral-100 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-800/60">
        <p className="text-sm font-bold text-neutral-900 dark:text-white">No se pudo cargar la app</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{error.message}</p>
        <button
          type="button"
          onClick={() => void mutate()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3.5 py-2 text-xs font-bold text-white transition-all duration-200 hover:bg-indigo-600"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> {isLoading ? 'Cargando app…' : 'Sin datos'}
      </div>
    );
  }

  const { navigation, view } = data;
  const activeView = view.slug;

  return (
    <div className="space-y-4">
      {/* Navegación de vistas: pills horizontales, scrolleables en móvil. */}
      {navigation.length > 1 && (
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={`Vistas de ${data.app.name}`}>
          {navigation.map((item) => {
            const Icon = resolveIcon(item.icon, inferRadarIcon([item.label, item.view], 'LayoutGrid'));
            const isActive = item.view === activeView;
            const tone = toneClasses(item.tone ?? accent);
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => selectView(item.view)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all duration-200 ${
                  isActive
                    ? `border-transparent ${toneClasses(accent).solid} shadow-sm`
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
                {item.badge && (
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black tabular-nums ${isActive ? 'bg-white/20 text-white' : tone.soft}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {view.hint && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{view.hint}</p>
      )}

      {view.components.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {view.components.map((component) => (
            <div key={component.id} className={MD_SPAN[component.grid?.desktop?.w ?? 6] ?? MD_SPAN[6]}>
              <ComponentCard component={component} sourceAppSlug={slug} onRefresh={() => void mutate()} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-neutral-200 dark:border-neutral-700">
          <BlockEmpty text="Esta vista todavía no tiene componentes." />
        </div>
      )}
    </div>
  );
}

/**
 * Card de un componente resuelto: mismo chrome que los widgets de Radar
 * (WidgetGrid), con las acciones declaradas por la app como botones al pie.
 */
function ComponentCard({
  component,
  sourceAppSlug,
  onRefresh,
}: {
  component: ResolvedRadarComponent;
  sourceAppSlug: string;
  onRefresh: () => void;
}) {
  const hasHeader = Boolean(component.title || component.icon);
  const Icon = resolveIcon(
    component.icon,
    inferRadarIcon([component.title, component.description, component.id], 'Layers'),
  );
  const tone = toneClasses(component.tone);

  return (
    <section
      className="flex h-full flex-col rounded-3xl border border-neutral-100 bg-white transition-all duration-200 dark:border-neutral-800 dark:bg-neutral-800/60"
      aria-label={component.title ?? component.id}
    >
      {hasHeader && (
        <header className="flex items-start gap-2.5 px-4 pt-4">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${tone.soft}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            {component.title && (
              <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">{component.title}</p>
            )}
            {component.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">{component.description}</p>
            )}
          </div>
        </header>
      )}

      <div className="min-w-0 flex-1 p-4">
        {component.error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Este componente no pudo cargar sus datos: {component.error}</span>
          </div>
        ) : component.blocks.length ? (
          <RadarBlocks blocks={component.blocks} />
        ) : (
          <BlockEmpty text="Este componente todavía no tiene contenido." />
        )}
      </div>

      {component.actions.length > 0 && (
        <footer className="flex flex-wrap gap-2 px-4 pb-4">
          {component.actions.map((action) => (
            <ActionButton key={action.key} action={action} sourceAppSlug={sourceAppSlug} onRefresh={onRefresh} />
          ))}
        </footer>
      )}
    </section>
  );
}

const ACTION_BUTTON_CLASS =
  'inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-neutral-600 transition-all duration-200 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:text-white';

function ActionButton({
  action,
  sourceAppSlug,
  onRefresh,
}: {
  action: RadarAction;
  sourceAppSlug: string;
  onRefresh: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const icon = useMemo(() => {
    const fallback: Record<RadarAction['kind'], string> = {
      navigate: 'ArrowRight',
      open_url: 'ExternalLink',
      open_chat: 'MessageCircle',
      open_contact: 'User',
      open_app: 'PanelsTopLeft',
      copy: 'Copy',
      refresh: 'RefreshCw',
    };
    return resolveIcon(action.icon, fallback[action.kind]);
  }, [action.icon, action.kind]);
  const Icon = icon;

  switch (action.kind) {
    case 'navigate': {
      // Sólo rutas internas: cualquier otra cosa no es un navigate válido.
      const url = action.url?.startsWith('/') ? action.url : null;
      if (!url) return null;
      return (
        <a href={url} className={ACTION_BUTTON_CLASS}>
          <Icon className="h-3 w-3" /> {action.label}
        </a>
      );
    }
    case 'open_url': {
      const url = action.url?.startsWith('https://') ? action.url : null;
      if (!url) return null;
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className={ACTION_BUTTON_CLASS}>
          <Icon className="h-3 w-3" /> {action.label}
        </a>
      );
    }
    case 'open_app': {
      if (!action.appSlug) return null;
      const href = buildRadarAppHref({
        appSlug: action.appSlug,
        view: action.view,
        context: action.context,
        sourceApp: sourceAppSlug,
      });
      if (!href) return null;
      return (
        <a href={href} className={ACTION_BUTTON_CLASS}>
          <Icon className="h-3 w-3" /> {action.label}
        </a>
      );
    }
    case 'copy': {
      if (!action.text) return null;
      return (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(action.text ?? '').then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }).catch(() => undefined);
          }}
          className={ACTION_BUTTON_CLASS}
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Icon className="h-3 w-3" />}
          {copied ? 'Copiado ✓' : action.label}
        </button>
      );
    }
    case 'refresh':
      return (
        <button type="button" onClick={onRefresh} className={ACTION_BUTTON_CLASS}>
          <Icon className="h-3 w-3" /> {action.label}
        </button>
      );
    case 'open_chat':
    case 'open_contact': {
      // Fase 1: el chat necesita el JID del contacto y acá sólo hay contactId,
      // así que ambas acciones llevan a Contactos.
      if (!action.contactId) return null;
      return (
        <a href="/contacts" className={ACTION_BUTTON_CLASS}>
          <Icon className="h-3 w-3" /> {action.label}
        </a>
      );
    }
    default:
      return null;
  }
}
