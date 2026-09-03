'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Menu, Pencil, Radar as RadarIcon, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import type { RadarSection, RadarTone } from '@/lib/plugins/radar/shared/blocks';
import { RADAR_SECTIONS, RADAR_SECTION_ICON, RADAR_SECTION_LABEL, isBuiltinRadarSection } from '@/lib/plugins/radar/shared/blocks';
import { parseRadarAppDeepLink } from '@/lib/plugins/radar/shared/app-link';
import './radar.css';
import { RadarSidebar, type RadarNavItem, type RadarNavKey } from './RadarSidebar';
import { RadarDocumentViewer } from './RadarDocumentViewer';
import { RadarDocumentProvider } from './blocks/radar-context';
import { ResumenSection } from './sections/ResumenSection';
import { ClientesSection } from './sections/ClientesSection';
import { PrioridadesSection } from './sections/PrioridadesSection';
import { InformesSection } from './sections/InformesSection';
import { SeguimientoSection } from './sections/SeguimientoSection';
import { BancoSection } from './sections/BancoSection';
import { CustomSection } from './sections/CustomSection';
import { RadarAppView } from './engine/RadarAppView';
import { useRadarBank } from './useRadarWidgets';
import type { RadarOverview } from './sections/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ClientsResponse = {
  total: number;
  counts: { p1: number; p2: number; p3: number; descartado: number; needsReview: number; withReports: number };
};

/** Lo que devuelve `resolveRadarSections` del lado del servidor, ya mezclado. */
type ResolvedSection = {
  section: string;
  label: string;
  icon: string;
  tone: RadarTone | null;
  hint: string | null;
  hidden: boolean;
  custom: boolean;
};

type AppearanceResponse = { sections?: ResolvedSection[] };

/** Apps del RADAR ENGINE publicadas para este usuario. */
type EngineAppEntry = {
  slug: string;
  name: string;
  icon: string | null;
  tone: RadarTone | null;
  description: string | null;
};

type EngineAppsResponse = { apps?: EngineAppEntry[] };

/**
 * Radar como aplicación: menú lateral colapsable, secciones propias y widgets
 * vivos que las IA pueden crear o editar desde el conector MCP. Cada sección
 * combina su vista fija con los widgets que le hayan asignado.
 */
export function RadarApp() {
  const searchParams = useSearchParams();
  const deepLink = useMemo(() => parseRadarAppDeepLink(searchParams), [searchParams]);
  const [section, setSection] = useState<RadarNavKey>(() => deepLink ? `app:${deepLink.appSlug}` : 'resumen');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [documentId, setDocumentId] = useState<number | null>(null);

  // Permite abrir una app/vista desde otra app o desde un enlace externo. Si
  // cambia el query string mediante navegación cliente, RADAR acompaña sin
  // necesitar un reload completo.
  useEffect(() => {
    if (deepLink) setSection(`app:${deepLink.appSlug}`);
  }, [deepLink]);

  const { data: overview, isLoading } = useSWR<RadarOverview>('/api/plugins/radar/overview', fetcher);
  const { data: clients } = useSWR<ClientsResponse>('/api/plugins/radar/clients', fetcher);
  // Icono, etiqueta y tono de cada sección: el equipo (o una IA, con
  // whatspro_radar_set_appearance) puede pisar los defaults del código.
  // La IA puede cambiar los iconos por MCP mientras el tablero está abierto, así
  // que esta key revalida al volver a la pestaña en vez de quedar congelada.
  const { data: appearanceData } = useSWR<AppearanceResponse>(
    '/api/plugins/radar/appearance',
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 60_000 },
  );
  // Comparte la key SWR con la sección Banco: se pide una sola vez.
  const { widgets: bankWidgets } = useRadarBank();
  // Apps declarativas del engine: cada una publicada entra al menú lateral.
  const { data: engineAppsData } = useSWR<EngineAppsResponse>(
    '/api/plugins/radar/apps',
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 120_000 },
  );

  const navItems = useMemo<RadarNavItem[]>(() => {
    const counts = overview?.counts;
    const engineApps = engineAppsData?.apps ?? [];
    // Métrica y alerta VIVAS de cada sección builtin. La etiqueta, el icono, el
    // tono y el hint ya vienen resueltos del servidor (defaults + overrides).
    const byKey: Record<RadarSection, { metric: number | null; hint: string; alert: RadarNavItem['alert'] }> = {
      resumen: {
        metric: counts?.analyzed ?? null,
        hint: 'Estado general del embudo',
        alert: counts?.p1 ? { label: `${counts.p1} P1`, tone: 'rose' } : null,
      },
      clientes: {
        metric: clients?.total ?? counts?.analyzed ?? null,
        hint: clients ? `${clients.counts.withReports} con informe` : 'Clientes analizados',
        alert: null,
      },
      prioridades: {
        metric: counts ? counts.p1 + counts.p2 : null,
        hint: 'Qué trabajar hoy y esta semana',
        alert: counts?.needsReview ? { label: 'revisar', tone: 'violet' } : null,
      },
      informes: { metric: null, hint: 'Documentos que genera Radar', alert: null },
      seguimiento: { metric: null, hint: 'Tareas abiertas y vencidas', alert: null },
      mejoras: { metric: null, hint: 'Fallas del embudo y correcciones', alert: null },
      trabajos: { metric: null, hint: 'Reportes de trabajo del equipo', alert: null },
    };
    const defaultTone: Record<RadarSection, RadarTone> = {
      resumen: 'indigo', clientes: 'sky', prioridades: 'rose', informes: 'violet',
      seguimiento: 'emerald', mejoras: 'amber', trabajos: 'teal',
    };

    // Mientras la apariencia no llegó, el menú sale de las constantes del
    // código: mismo orden y mismos textos que antes de las secciones dinámicas.
    const resolved: ResolvedSection[] = appearanceData?.sections?.length
      ? appearanceData.sections
      : RADAR_SECTIONS.map((key) => ({
          section: key,
          label: RADAR_SECTION_LABEL[key],
          icon: RADAR_SECTION_ICON[key],
          tone: null,
          hint: null,
          hidden: false,
          custom: false,
        }));

    return [
      ...resolved
        .filter((entry) => !entry.hidden)
        .map((entry) => {
          const builtin = isBuiltinRadarSection(entry.section) ? byKey[entry.section] : null;
          return {
            key: entry.section,
            label: entry.label,
            icon: entry.icon,
            tone: entry.tone ?? (isBuiltinRadarSection(entry.section) ? defaultTone[entry.section] : 'slate'),
            metric: builtin?.metric ?? null,
            hint: entry.hint ?? builtin?.hint ?? 'Sección personalizada',
            alert: builtin?.alert ?? null,
          };
        }),
      // Apps construidas por IA con el engine: entran al menú después de las
      // secciones, detrás de un separador para que no se mezclen con ellas.
      ...(engineApps.length
        ? [
            {
              key: 'sep-apps',
              label: 'Apps',
              icon: 'Rocket',
              tone: 'slate' as const,
              metric: null,
              hint: '',
              alert: null,
              separator: true,
            },
            ...engineApps.map((app) => ({
              key: `app:${app.slug}`,
              label: app.name,
              icon: app.icon ?? 'Rocket',
              tone: app.tone ?? ('violet' as const),
              metric: null,
              hint: app.description ?? 'App construida por IA',
              alert: null,
            })),
          ]
        : []),
      {
        key: 'banco' as const,
        label: 'Banco',
        icon: 'Boxes',
        tone: 'slate' as const,
        metric: bankWidgets.length || null,
        hint: 'Widgets guardados y plantillas',
        alert: null,
      },
    ];
  }, [overview, clients, bankWidgets.length, appearanceData, engineAppsData]);

  // La sección activa puede desaparecer del menú (la ocultó o la borró una IA
  // mientras el tablero estaba abierto): se cae a la primera visible.
  const activeSection = navItems.some((item) => item.key === section) ? section : (navItems[0]?.key ?? 'resumen');

  const openDocument = (id: number) => setDocumentId(id);

  function selectSection(key: RadarNavKey) {
    setSection(key);
    setDrawerOpen(false);
  }

  return (
    <RadarDocumentProvider open={openDocument}>
      <div className="radar-ui flex h-full min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
        {/* Escritorio: menú lateral fijo y colapsable. */}
        <aside className="hidden shrink-0 md:block">
          <RadarSidebar
            items={navItems}
            active={activeSection}
            collapsed={collapsed}
            onSelect={selectSection}
            onToggleCollapse={() => setCollapsed((value) => !value)}
          />
        </aside>

        {/* Móvil: el mismo menú, como cajón sobre el contenido. */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="h-full">
              <RadarSidebar
                items={navItems}
                active={activeSection}
                collapsed={false}
                variant="drawer"
                onSelect={selectSection}
                onToggleCollapse={() => undefined}
                onClose={() => setDrawerOpen(false)}
              />
            </div>
            <button type="button" className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2.5 border-b border-neutral-100 bg-white px-3 py-3 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menú de Radar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-500 transition-all duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-white md:hidden">
              <RadarIcon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-black tracking-tight text-neutral-900 dark:text-white sm:text-xl">
                {navItems.find((item) => item.key === activeSection)?.label}
              </h1>
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {navItems.find((item) => item.key === activeSection)?.hint}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              aria-pressed={editing}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-200 ${
                editing
                  ? 'bg-indigo-500 text-white shadow-sm'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white'
              }`}
            >
              {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{editing ? 'Listo' : 'Editar widgets'}</span>
            </button>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-7">
            <div className="mx-auto max-w-[80rem]">
              {isLoading && !overview ? (
                <div className="flex items-center justify-center gap-2 py-24 text-sm text-neutral-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando Radar…
                </div>
              ) : (
                <>
                  {activeSection === 'resumen' && <ResumenSection overview={overview} editing={editing} />}
                  {activeSection === 'clientes' && <ClientesSection editing={editing} />}
                  {activeSection === 'prioridades' && <PrioridadesSection overview={overview} editing={editing} />}
                  {activeSection === 'informes' && <InformesSection editing={editing} />}
                  {activeSection === 'seguimiento' && <SeguimientoSection editing={editing} />}
                  {activeSection === 'mejoras' && (
                    <InformesSection
                      editing={editing}
                      section="mejoras"
                      categories={[{ key: 'mejoras', label: 'Análisis de mejora' }]}
                      intro="Fallas del embudo, patrones a corregir y propuestas de mejora que Radar detecta al analizar las conversaciones."
                    />
                  )}
                  {activeSection === 'banco' && <BancoSection />}
                  {activeSection === 'trabajos' && (
                    <InformesSection
                      editing={editing}
                      section="trabajos"
                      categories={[{ key: 'trabajos', label: 'Reportes de trabajo' }]}
                      intro="Reportes de lo hecho: entregas, producción y seguimiento del equipo."
                    />
                  )}
                  {/* App declarativa del engine: el renderer dibuja la vista resuelta. */}
                  {activeSection.startsWith('app:') && (
                    <RadarAppView
                      slug={activeSection.slice(4)}
                      initialView={deepLink?.appSlug === activeSection.slice(4) ? deepLink.view : null}
                      initialContext={deepLink?.appSlug === activeSection.slice(4) ? deepLink.context : undefined}
                    />
                  )}
                  {/* Sección personalizada: sin vista fija, sólo sus widgets. */}
                  {!isBuiltinRadarSection(activeSection) && activeSection !== 'banco' && !activeSection.startsWith('app:') && (
                    <CustomSection
                      section={activeSection}
                      editing={editing}
                      intro={navItems.find((item) => item.key === activeSection)?.hint}
                    />
                  )}
                </>
              )}
            </div>
          </main>
        </div>

        {documentId !== null && (
          <RadarDocumentViewer documentId={documentId} onClose={() => setDocumentId(null)} />
        )}
      </div>
    </RadarDocumentProvider>
  );
}
