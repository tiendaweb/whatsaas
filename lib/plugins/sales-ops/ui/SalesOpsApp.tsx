'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Menu, Timer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { OverviewPayload } from '../shared/api-types';
import { OwnerFilter, isOwnerFilterValue, type OwnerFilterValue } from './components/OwnerFilter';
import { MobileBar, Sidebar, type SidebarUser } from './components/Sidebar';
import { VISTA_LABELS, isVista, type Vista } from './components/vistas';
import { LS_OWNER, SALES_OPS_API, fetcher, fmtInt } from './components/format';
import { FocusView } from './focus/FocusView';
import { LimiteDeError } from './focus/LimiteDeError';
import { ColaView } from './views/ColaView';
import { ExperimentosView } from './views/ExperimentosView';
import { PromptStudioView } from './views/PromptStudioView';
import { ContactosView } from './views/ContactosView';
import { FichaView } from './views/FichaView';
import { HoyView } from './views/HoyView';
import { ListaView, type ListaVista } from './views/ListaView';
import { MetricasView } from './views/MetricasView';
import { ProgramadosView } from './views/ProgramadosView';
import { AudiosView } from './views/AudiosView';
import { ProduccionView } from './views/ProduccionView';
import { AyudaView } from './views/AyudaView';
import { RespuestasView } from './views/RespuestasView';

const LIST_VISTAS: ListaVista[] = ['dinero', 'oportunidades', 'barrido', 'limpieza', 'todos'];
const LS_COLLAPSED = 'sales-ops:sidebar-collapsed';

function isListaVista(v: Vista): v is ListaVista {
  return (LIST_VISTAS as string[]).includes(v);
}

/**
 * Shell del Command Center: aplicación aparte a pantalla completa (el layout
 * del dashboard hace takeover en /plugins/sales-ops). La URL manda (`?vista=`
 * y `?chat=`); localStorage recuerda el responsable y el rail plegado.
 */
export function SalesOpsApp({ slug }: { slug: string[] }) {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-background" />}>
      <SalesOpsShell slug={slug} />
    </Suspense>
  );
}

function SalesOpsShell({ slug }: { slug: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `?vista=` gana; el primer segmento del slug queda como atajo (/plugins/sales-ops/dinero).
  const vista: Vista = useMemo(() => {
    const fromQuery = searchParams.get('vista');
    if (isVista(fromQuery)) return fromQuery;
    const fromSlug = slug?.[0];
    if (isVista(fromSlug)) return fromSlug;
    return 'hoy';
  }, [searchParams, slug]);

  const chatId = useMemo(() => {
    const raw = Number(searchParams.get('chat'));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }, [searchParams]);

  /** Sección de la ficha con la que abrir (`?sec=chat` desde el botón de las listas). */
  const fichaSeccion = useMemo(() => searchParams.get('sec'), [searchParams]);

  const [owner, setOwner] = useState<OwnerFilterValue>('todos');
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LS_OWNER);
      if (isOwnerFilterValue(saved)) setOwner(saved);
      setCollapsed(window.localStorage.getItem(LS_COLLAPSED) === '1');
    } catch {
      /* sin storage */
    }
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const onNav = useCallback(
    (v: Vista) => {
      setDrawer(false);
      setParams({ vista: v === 'hoy' ? null : v, chat: null });
    },
    [setParams],
  );
  /**
   * Focus recuerda de dónde se entró (`?desde=`): salir devuelve a la lista que
   * se estaba mirando, no a Hoy. Entrar desde otro lado y volver siempre al
   * mismo lugar hacía perder el hilo de la tanda.
   */
  const entrarFocus = useCallback(() => setParams({ vista: 'focus', desde: vista === 'hoy' ? null : vista, chat: null, sec: null }), [setParams, vista]);
  const salirFocus = useCallback(() => {
    const desde = searchParams.get('desde');
    setParams({ vista: isVista(desde) && desde !== 'focus' ? desde : null, desde: null });
  }, [setParams, searchParams]);

  const onOpen = useCallback((id: number) => setParams({ chat: String(id), sec: null }), [setParams]);
  /** Abre la ficha directamente en el chat del contacto. */
  const onOpenChat = useCallback((id: number) => setParams({ chat: String(id), sec: 'chat' }), [setParams]);
  const onClose = useCallback(() => setParams({ chat: null, sec: null }), [setParams]);

  const onOwner = (v: OwnerFilterValue) => {
    setOwner(v);
    try {
      window.localStorage.setItem(LS_OWNER, v);
    } catch {
      /* sin storage */
    }
  };
  const onToggleCollapse = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(LS_COLLAPSED, c ? '0' : '1');
      } catch {
        /* sin storage */
      }
      return !c;
    });
  };

  // Conteos del rail y subtítulo. Comparte caché SWR con HoyView.
  const { data: overview } = useSWR<OverviewPayload>(`${SALES_OPS_API}/overview`, fetcher, { refreshInterval: 60_000 });
  const { data: user } = useSWR<SidebarUser>('/api/user', fetcher);

  const counts = useMemo<Partial<Record<Vista, number>>>(() => {
    if (!overview) return {};
    return {
      dinero: overview.counters.moneyNow,
      oportunidades: overview.counters.opportunities,
      barrido: overview.counters.sweep,
      limpieza: overview.counters.preDiscard + (overview.distribution.GX ?? 0),
      respuestas: overview.counters.respondedToday,
      todos: overview.audit.analyzed,
    };
  }, [overview]);

  const subtitle = useMemo(() => {
    let fecha = '';
    try {
      fecha = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    } catch {
      fecha = new Date().toISOString().slice(0, 10);
    }
    const auditados = overview ? ` · Auditados ${fmtInt(overview.audit.analyzed)} / ${fmtInt(overview.audit.total)}` : '';
    return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)}${auditados}`;
  }, [overview]);

  const content = (() => {
    if (vista === 'hoy') return <HoyView owner={owner} onChangeVista={onNav} onOpen={onOpen} />;
    if (isListaVista(vista)) return <ListaView vista={vista} owner={owner} selectedChatId={chatId} onOpen={onOpen} onOpenChat={onOpenChat} onNav={onNav} />;
    if (vista === 'respuestas') return <RespuestasView />;
    if (vista === 'cola') return <ColaView onOpen={onOpen} selectedChatId={chatId} />;
    if (vista === 'programados') return <ProgramadosView onOpen={onOpen} />;
    if (vista === 'audios') return <AudiosView onOpen={onOpen} />;
    if (vista === 'produccion') return <ProduccionView onOpen={onOpen} />;
    if (vista === 'ayuda') return <AyudaView onNav={onNav} />;
    if (vista === 'experimentos') return <ExperimentosView />;
    if (vista === 'prompts') return <PromptStudioView onOpen={onOpen} onNav={onNav} />;
    if (vista === 'clientes') return <ContactosView onOpen={onOpen} onOpenChat={onOpenChat} owner={owner} />;
    return <MetricasView />;
  })();

  const sidebarProps = { vista, counts, owner, user: user ?? null, onNav, onOwner };

  // Focus se dibuja solo: ni rail, ni encabezado, ni barra inferior. No es un
  // overlay encima del shell — el shell directamente no se monta.
  //
  // Con su propio límite de error: un componente no puede atrapar lo que
  // revienta adentro de él mismo, así que los límites por columna que tiene
  // adentro no cubren al Focus en sí. Sin este, un error suyo se lleva la
  // pantalla al boundary genérico de la app ("No se pudo cargar la página").
  if (vista === 'focus') {
    return (
      <LimiteDeError nombre="Focus">
        <FocusView owner={owner} onSalir={salirFocus} />
      </LimiteDeError>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar {...sidebarProps} collapsed={collapsed} onToggleCollapse={onToggleCollapse} className="hidden lg:flex" />

      {/* Drawer móvil: mismas vistas que el rail. */}
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-[260px] p-0 sm:max-w-[260px] lg:hidden">
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <Sidebar {...sidebarProps} className="w-full border-r-0" />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 lg:px-6 lg:py-3">
          <Button variant="ghost" size="icon" className="size-8 lg:hidden" onClick={() => setDrawer(true)} aria-label="Menú">
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight lg:text-lg">{VISTA_LABELS[vista]}</h1>
            <p className="truncate text-[11px] text-muted-foreground lg:text-xs">{subtitle}</p>
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" onClick={entrarFocus} title="Trabajar de a un cliente, en bloques de 25 minutos">
            <Timer className="size-4" aria-hidden />
            <span className="hidden sm:inline">Focus</span>
          </Button>
          <div className="lg:hidden">
            <OwnerFilter value={owner} onChange={onOwner} />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:px-6 lg:py-5 lg:pb-8">
            <div className="mx-auto w-full max-w-[1100px]">{content}</div>
          </main>

          {isDesktop && chatId != null && (
            <aside className="hidden w-[440px] shrink-0 flex-col border-l border-border lg:flex" aria-label="Ficha del contacto">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ficha</span>
                <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Cerrar ficha">
                  <X className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <FichaView key={`${chatId}-${fichaSeccion ?? ''}`} chatId={chatId} seccionInicial={fichaSeccion} onClose={onClose} />
              </div>
            </aside>
          )}
        </div>
      </div>

      {!isDesktop && (
        <Sheet open={chatId != null} onOpenChange={(open) => !open && onClose()}>
          <SheetContent side="right" className={cn('w-full max-w-full overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-full')}>
            <SheetTitle className="sr-only">Ficha del contacto</SheetTitle>
            {chatId != null && <FichaView key={`${chatId}-${fichaSeccion ?? ''}`} chatId={chatId} seccionInicial={fichaSeccion} onClose={onClose} />}
          </SheetContent>
        </Sheet>
      )}

      <MobileBar vista={vista} counts={counts} onNav={onNav} onMore={() => setDrawer(true)} />
    </div>
  );
}
