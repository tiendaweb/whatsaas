'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { ResumenIa } from '../shared/api-types';
import { VISTAS, VISTA_LABELS, isVista, type Vista } from '../shared/vistas';
import { MobileBar, Sidebar, type SidebarUser } from './componentes/Sidebar';
import { CargandoBloques, ErrorEstado } from './componentes/Estados';
import { IA_API, fetcher, fmtInt } from './componentes/format';
import { InicioView } from './vistas/InicioView';
import { AppsView } from './vistas/AppsView';
import { AgenteView, AutomatizacionesView, BancoView, ConectoresView, FuncionesView } from './vistas/Prestadas';

const LS_COLLAPSED = 'ia:sidebar-collapsed';

/**
 * Shell del hub de IA: aplicación aparte a pantalla completa, igual que Empresa
 * y Marketing (el layout del dashboard hace takeover en /plugins/ia).
 *
 * La URL manda: `?vista=` es el estado real, así que un enlace al banco de
 * claves se pega en un chat y abre eso. localStorage sólo recuerda el rail
 * plegado, nunca es la fuente de la verdad.
 */
export function IaApp({ slug }: { slug: string[] }) {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-background" />}>
      <IaShell slug={slug} />
    </Suspense>
  );
}

function IaShell({ slug }: { slug: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `?vista=` gana; el primer segmento del slug queda como atajo
  // (/plugins/ia/banco).
  const vista: Vista = useMemo(() => {
    const fromQuery = searchParams.get('vista');
    if (isVista(fromQuery)) return fromQuery;
    const fromSlug = slug?.[0];
    if (isVista(fromSlug)) return fromSlug;
    return 'inicio';
  }, [searchParams, slug]);

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

  const { data, error, isLoading, mutate } = useSWR<ResumenIa>(`${IA_API}/resumen`, fetcher, {
    refreshInterval: 120_000,
  });
  const { data: user } = useSWR<SidebarUser>('/api/user', fetcher);

  /**
   * Mientras carga se muestran todas: un rail que aparece con dos items y a los
   * 300 ms se llena hasta siete salta a la vista y hace fallar el clic que ya se
   * había apuntado.
   */
  const vistas = useMemo<Vista[]>(
    () => (data ? VISTAS.filter((v) => data.vistasDisponibles.includes(v)) : [...VISTAS]),
    [data],
  );

  const counts = useMemo<Partial<Record<Vista, number>>>(() => {
    if (!data) return {};
    return {
      automatizaciones: data.automatizaciones.activas,
      funciones: data.funciones.integradasActivas + data.funciones.propiasActivas,
      conectores: data.conectores.filter((c) => c.activo).length,
      banco: data.banco.activas,
    };
  }, [data]);

  const subtitulo = useMemo(() => {
    if (!data) return 'Cargando el panorama…';
    const estado = data.agente.activo ? 'Agente prendido' : 'Agente apagado';
    return `${estado} · ${fmtInt(data.automatizaciones.activas)} automatizaciones · ${fmtInt(data.banco.activas)} claves activas`;
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
    if (vista === 'funciones') return <FuncionesView />;
    if (vista === 'conectores') return <ConectoresView />;
    if (vista === 'banco') return <BancoView />;

    if (error) return <ErrorEstado mensaje={String(error.message ?? error)} onReintentar={() => void mutate()} />;
    if (isLoading || !data) return <CargandoBloques />;

    if (vista === 'agente') return <AgenteView agente={data.agente} />;
    if (vista === 'automatizaciones') return <AutomatizacionesView automatizaciones={data.automatizaciones} />;
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
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:px-6 lg:py-5 lg:pb-8">
          <div className="mx-auto w-full max-w-[1100px]">{contenido}</div>
        </main>
      </div>

      <MobileBar vista={vista} vistas={vistas} counts={counts} onNav={onNav} onMore={() => setDrawer(true)} />
    </div>
  );
}
