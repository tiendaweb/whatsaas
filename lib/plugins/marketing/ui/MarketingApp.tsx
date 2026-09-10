'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { ResumenMarketing } from '../shared/api-types';
import { VISTAS, VISTA_LABELS, isVista, type Vista } from '../shared/vistas';
import { MobileBar, Sidebar, type SidebarUser } from './componentes/Sidebar';
import { CargandoBloques, ErrorEstado } from './componentes/Estados';
import { MARKETING_API, fetcher, fmtInt, fmtMonto } from './componentes/format';
import { InicioView } from './vistas/InicioView';
import { AppsView } from './vistas/AppsView';
import { ComentariosView } from './vistas/ComentariosView';
import { AnunciosView, DifusionView, FormulariosView, PublicacionesView } from './vistas/Prestadas';

const LS_COLLAPSED = 'marketing:sidebar-collapsed';

/**
 * Shell de Marketing: aplicación aparte a pantalla completa, igual que Empresa
 * y el Command Center (el layout del dashboard hace takeover en
 * /plugins/marketing).
 *
 * La URL manda: `?vista=` y `?dias=` son el estado real, así que un enlace a
 * "Meta Ads de los últimos 7 días" se pega en un chat y abre eso. localStorage
 * sólo recuerda el rail plegado, nunca es la fuente de la verdad.
 */
export function MarketingApp({ slug }: { slug: string[] }) {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-background" />}>
      <MarketingShell slug={slug} />
    </Suspense>
  );
}

function MarketingShell({ slug }: { slug: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `?vista=` gana; el primer segmento del slug queda como atajo
  // (/plugins/marketing/anuncios).
  const vista: Vista = useMemo(() => {
    const fromQuery = searchParams.get('vista');
    if (isVista(fromQuery)) return fromQuery;
    const fromSlug = slug?.[0];
    if (isVista(fromSlug)) return fromSlug;
    return 'inicio';
  }, [searchParams, slug]);

  const dias = useMemo(() => {
    const raw = Number(searchParams.get('dias'));
    return Number.isInteger(raw) && raw >= 7 && raw <= 180 ? raw : 30;
  }, [searchParams]);

  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(LS_COLLAPSED) === '1');
    } catch {
      /* sin storage */
    }
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
      setParams({ vista: v === 'inicio' ? null : v });
    },
    [setParams],
  );

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

  const { data, error, isLoading, mutate } = useSWR<ResumenMarketing>(`${MARKETING_API}/resumen?dias=${dias}`, fetcher, {
    refreshInterval: 120_000,
  });
  const { data: user } = useSWR<SidebarUser>('/api/user', fetcher);

  /**
   * Mientras carga se muestran todas: un rail que aparece con dos items y a los
   * 300 ms se llena hasta seis salta a la vista y hace fallar el clic que ya se
   * había apuntado.
   */
  const vistas = useMemo<Vista[]>(
    () => (data ? VISTAS.filter((v) => data.vistasDisponibles.includes(v)) : [...VISTAS]),
    [data],
  );

  const counts = useMemo<Partial<Record<Vista, number>>>(() => {
    if (!data) return {};
    return {
      anuncios: data.publicidad.campanasActivas,
      difusion: data.difusion.programadas,
      publicaciones: data.publicaciones.programadas,
      comentarios: data.publicaciones.comentariosNuevos,
      formularios: data.captacion.formularios,
    };
  }, [data]);

  const subtitulo = useMemo(() => {
    if (!data) return 'Cargando el panorama…';
    const gasto = data.publicidad.gasto.length ? fmtMonto(data.publicidad.gasto[0]) : 'sin gasto';
    return `${data.rangoDias} días · ${gasto} · ${fmtInt(data.publicidad.resultados)} resultados`;
  }, [data]);

  /**
   * La vista de la URL puede apuntar a una app que este equipo no tiene (un
   * enlace compartido entre equipos, o una app que se apagó). En vez de dibujar
   * una pantalla que va a fallar, se vuelve al Inicio.
   */
  useEffect(() => {
    if (!data) return;
    if (!data.vistasDisponibles.includes(vista)) setParams({ vista: null });
  }, [data, vista, setParams]);

  const contenido = (() => {
    // Las vistas prestadas no dependen del resumen: si la consulta de números
    // falla, Meta Ads y Formularios se tienen que poder seguir usando igual.
    if (vista === 'anuncios') return <AnunciosView />;
    if (vista === 'publicaciones') return <PublicacionesView />;
    if (vista === 'formularios') return <FormulariosView />;
    // Los comentarios no dependen del resumen: si los números de Meta Ads
    // fallan, contestarle a alguien tiene que seguir andando.
    if (vista === 'comentarios') return <ComentariosView />;

    if (error) return <ErrorEstado mensaje={String(error.message ?? error)} onReintentar={() => void mutate()} />;
    if (isLoading || !data) return <CargandoBloques />;

    if (vista === 'difusion') return <DifusionView difusion={data.difusion} />;
    if (vista === 'apps') return <AppsView apps={data.apps} />;
    return <InicioView data={data} onChangeVista={onNav} />;
  })();

  const sidebarProps = { vista, vistas, counts, user: user ?? null, onNav };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar {...sidebarProps} collapsed={collapsed} onToggleCollapse={onToggleCollapse} className="hidden lg:flex" />

      {/* Drawer móvil: las mismas vistas que el rail. */}
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
            <p className="truncate text-[11px] text-muted-foreground lg:text-xs">{subtitulo}</p>
          </div>
          {/* El rango es del panorama; las pantallas prestadas traen el suyo. */}
          {(vista === 'inicio' || vista === 'apps') && (
            <div className="flex shrink-0 gap-1">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setParams({ dias: d === 30 ? null : String(d) })}
                  aria-pressed={dias === d}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                    dias === d ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          )}
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:px-6 lg:py-5 lg:pb-8">
          <div className="mx-auto w-full max-w-[1100px]">{contenido}</div>
        </main>
      </div>

      <MobileBar vista={vista} vistas={vistas} counts={counts} onNav={onNav} onMore={() => setDrawer(true)} />
    </div>
  );
}
