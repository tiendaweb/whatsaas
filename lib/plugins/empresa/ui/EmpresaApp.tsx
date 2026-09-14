'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { ResumenEmpresa } from '../shared/api-types';
import { VISTAS, VISTA_LABELS, isVista, type Vista } from '../shared/vistas';

import { MobileBar, Sidebar, type SidebarUser } from './componentes/Sidebar';
import { MarcaFilter } from './componentes/MarcaFilter';
import { CargandoBloques, ErrorEstado } from './componentes/Estados';
import { EMPRESA_API, LS_MARCA, fetcher, fmtInt } from './componentes/format';
import { InicioView } from './vistas/InicioView';
import { AppsView } from './vistas/AppsView';
import { CrmView } from './vistas/CrmView';
import { ProyectosView } from './vistas/ProyectosView';
import { MembresiasView } from './vistas/MembresiasView';
import { ClientesView } from './vistas/ClientesView';
import {
  ContratosView,
  OportunidadesView,
  VentasView,
} from './vistas/Prestadas';

/**
 * Las vistas que se dibujan solas, de borde a borde.
 *
 * Traen su propia barra de título y su propio scroll: el shell no les pone
 * encabezado ni la caja centrada de 1100 px.
 */
const PANTALLA_COMPLETA: Vista[] = ['inicio', 'ficha', 'crm', 'proyectos', 'marcas', 'planes', 'suscripciones', 'clientes'];

const LS_COLLAPSED = 'empresa:sidebar-collapsed';

/**
 * Shell de Empresa: aplicación aparte a pantalla completa, igual que el
 * Command Center (el layout del dashboard hace takeover en /plugins/empresa).
 *
 * La URL manda: `?vista=` y `?marca=` son el estado real, así que un enlace a
 * "Suscripciones de AAPP SPACE" se pega en un chat y abre eso. localStorage
 * sólo recuerda preferencias —la marca por defecto y el rail plegado—, nunca
 * es la fuente de la verdad.
 */
export function EmpresaApp({ slug }: { slug: string[] }) {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-background" />}>
      <EmpresaShell slug={slug} />
    </Suspense>
  );
}

function EmpresaShell({ slug }: { slug: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `?vista=` gana; el primer segmento del slug queda como atajo
  // (/plugins/empresa/marcas).
  const vista: Vista = useMemo(() => {
    const fromQuery = searchParams.get('vista');
    if (isVista(fromQuery)) return fromQuery;
    const fromSlug = slug?.[0];
    if (isVista(fromSlug)) return fromSlug;
    return 'inicio';
  }, [searchParams, slug]);

  const marcaEnUrl = useMemo(() => {
    const raw = Number(searchParams.get('marca'));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }, [searchParams]);

  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  /** Marca recordada, sólo para la primera entrada sin `?marca=` en la URL. */
  const [marcaRecordada, setMarcaRecordada] = useState<number | null>(null);
  const [leyoStorage, setLeyoStorage] = useState(false);

  useEffect(() => {
    try {
      const guardada = Number(window.localStorage.getItem(LS_MARCA));
      if (Number.isInteger(guardada) && guardada > 0) setMarcaRecordada(guardada);
      setCollapsed(window.localStorage.getItem(LS_COLLAPSED) === '1');
    } catch {
      /* sin storage */
    }
    setLeyoStorage(true);
  }, []);

  const marcaId = marcaEnUrl ?? (leyoStorage ? marcaRecordada : null);

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

  const onMarca = useCallback(
    (id: number | null) => {
      // Se guarda la elección y además se escribe en la URL: sin lo segundo,
      // recargar con un `?marca=` viejo pegado revertiría el cambio.
      setMarcaRecordada(id);
      try {
        if (id == null) window.localStorage.removeItem(LS_MARCA);
        else window.localStorage.setItem(LS_MARCA, String(id));
      } catch {
        /* sin storage */
      }
      setParams({ marca: id == null ? null : String(id) });
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

  const { data, error, isLoading, mutate } = useSWR<ResumenEmpresa>(
    `${EMPRESA_API}/resumen${marcaId == null ? '' : `?marca=${marcaId}`}`,
    fetcher,
    { refreshInterval: 120_000 },
  );
  const { data: user } = useSWR<SidebarUser>('/api/user', fetcher);

  /**
   * Mientras carga el resumen se muestran todas: un rail que aparece con dos
   * items y a los 300 ms se llena hasta nueve salta a la vista y hace fallar
   * el clic que ya se había apuntado.
   */
  const vistas = useMemo<Vista[]>(
    () => (data ? VISTAS.filter((v) => data.vistasDisponibles.includes(v)) : [...VISTAS]),
    [data],
  );

  const marcas = data?.marcas ?? [];
  const marcaElegida = marcaId == null ? null : marcas.find((m) => m.id === marcaId)?.name ?? null;

  const counts = useMemo<Partial<Record<Vista, number>>>(() => {
    if (!data) return {};
    return {
      marcas: data.contadores.marcas,
      planes: data.contadores.planes,
      suscripciones: data.contadores.suscripcionesActivas,
      clientes: data.contadores.clientes,
      oportunidades: data.contadores.oportunidadesAbiertas,
      contratos: data.apps.contratosPorVencer,
    };
  }, [data]);

  const subtitulo = useMemo(() => {
    if (!data) return 'Cargando el negocio…';
    const marca = marcaElegida ? `${marcaElegida} · ` : '';
    return `${marca}${fmtInt(data.contadores.suscripcionesActivas)} suscripciones activas · ${fmtInt(data.contadores.porVencer30)} por vencer`;
  }, [data, marcaElegida]);

  /**
   * La vista de la URL puede apuntar a una app que este equipo no tiene (un
   * enlace compartido entre equipos, o una app que se apagó). En vez de
   * dibujar una pantalla que va a fallar, se vuelve al Inicio.
   */
  useEffect(() => {
    if (!data) return;
    if (!data.vistasDisponibles.includes(vista)) setParams({ vista: null });
  }, [data, vista, setParams]);

  const contenido = (() => {
    // Las vistas prestadas no dependen del resumen: si la consulta de números
    // falla, Ventas y Clientes se tienen que poder seguir usando igual.
    // Marcas, Planes y Suscripciones son la misma cabina con distinto modo, y
    // traen sus propios datos: no dependen del resumen.
    if (vista === 'marcas' || vista === 'planes' || vista === 'suscripciones') {
      return (
        <MembresiasView
          modo={vista}
          marcaId={marcaId}
          marcas={marcas.map((m) => ({ id: m.id, name: m.name }))}
          onMarca={onMarca}
          onMenu={() => setDrawer(true)}
        />
      );
    }
    if (vista === 'clientes') return <ClientesView marcaId={marcaId} marcas={marcas.map((m) => ({ id: m.id, name: m.name }))} onMarca={onMarca} onMenu={() => setDrawer(true)} />;
    if (vista === 'ventas') return <VentasView marca={marcaElegida} />;
    if (vista === 'oportunidades') return <OportunidadesView marca={marcaElegida} />;
    if (vista === 'contratos') return <ContratosView />;
    // El CRM tampoco depende del resumen: trae sus propios datos y tiene que
    // poder usarse aunque la consulta de números falle.
    if (vista === 'crm') return <CrmView marcaId={marcaId} marcas={marcas.map((m) => ({ id: m.id, name: m.name }))} onMarca={onMarca} onMenu={() => setDrawer(true)} />;
    // Proyectos tampoco depende del resumen: lee Tareas OS por su cuenta.
    if (vista === 'proyectos') return <ProyectosView onMenu={() => setDrawer(true)} />;

    if (error) return <ErrorEstado mensaje={String(error.message ?? error)} onReintentar={() => void mutate()} />;
    if (isLoading || !data) return <CargandoBloques />;

    if (vista === 'apps') return <AppsView apps={data.apps} onChangeVista={onNav} />;
    return (
      <InicioView
        data={data}
        onChangeVista={onNav}
        onMarca={onMarca}
        onMenu={() => setDrawer(true)}
        nombre={user?.name ?? null}
      />
    );
  })();

  const sidebarProps = { vista, vistas, counts, marcas, marcaId, user: user ?? null, onNav, onMarca };

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
        {/* El tablero de embudos y Proyectos traen su propio encabezado
            (topbar), con el nombre de lo que se está mirando y sus totales:
            dibujar además el del shell dejaba dos títulos iguales uno encima
            del otro y se comía un renglón entero de alto útil. */}
        {!PANTALLA_COMPLETA.includes(vista) && (
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 lg:px-6 lg:py-3">
          <Button variant="ghost" size="icon" className="size-8 lg:hidden" onClick={() => setDrawer(true)} aria-label="Menú">
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight lg:text-lg">{VISTA_LABELS[vista]}</h1>
            <p className="truncate text-[11px] text-muted-foreground lg:text-xs">{subtitulo}</p>
          </div>
          <div className="lg:hidden">
            <MarcaFilter marcas={marcas} value={marcaId} onChange={onMarca} />
          </div>
        </header>
        )}

        {/* Estas vistas ocupan la pantalla entera y scrollean adentro: dentro
            de la caja de 1100px con padding, las columnas quedaban en un
            canuto y el arrastre no llegaba a los bordes. */}
        {PANTALLA_COMPLETA.includes(vista) ? (
          <main className="flex min-h-0 min-w-0 flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">{contenido}</main>
        ) : (
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:px-6 lg:py-5 lg:pb-8">
            <div className="mx-auto w-full max-w-[1100px]">{contenido}</div>
          </main>
        )}
      </div>

      <MobileBar vista={vista} vistas={vistas} counts={counts} onNav={onNav} onMore={() => setDrawer(true)} />
    </div>
  );
}
