'use client';

import { Suspense, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BadgeDollarSign,
  CreditCard,
  LayoutDashboard,
  ListOrdered,
  LayoutPanelTop,
  Users,
  Wallet,
} from 'lucide-react';
import { F } from './estilo';
import { ResumenView } from './views/ResumenView';
import { MovimientosView } from './views/MovimientosView';
import { MembresiasView } from './views/MembresiasView';
import { ClientesView } from './views/ClientesView';
import { CobrosView } from './views/CobrosView';

const VISTAS = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'movimientos', label: 'Movimientos', icon: ListOrdered },
  { id: 'cobros', label: 'Cobros', icon: Wallet },
  { id: 'membresias', label: 'Membresías', icon: CreditCard },
  { id: 'clientes', label: 'Clientes', icon: Users },
] as const;

type VistaId = (typeof VISTAS)[number]['id'];

/**
 * Finanzas OS: aplicación aparte a pantalla completa (patrón Tareas OS /
 * Command Center). La URL es la fuente de verdad: `?vista=` decide la pantalla
 * y `?cliente=` abre una ficha, así el navegador atrás/adelante funciona.
 */
function AppInterna() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vista = (VISTAS.some((v) => v.id === searchParams.get('vista')) ? searchParams.get('vista') : 'resumen') as VistaId;

  const setParam = useCallback(
    (cambios: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(cambios)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const abrirCliente = useCallback((id: number) => setParam({ vista: 'clientes', cliente: String(id) }), [setParam]);

  return (
    <div className="fixed inset-0 z-40 flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Riel izquierdo (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/60 p-4 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-1">
          <span className={`${F.iconoCaja} bg-emerald-600 text-white`}>
            <BadgeDollarSign className="size-5" />
          </span>
          <div>
            <p className="text-sm font-black tracking-tight">Finanzas OS</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Caja · Membresías · Clientes</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {VISTAS.map((v) => (
            <button key={v.id} type="button" onClick={() => setParam({ vista: v.id, cliente: null })} className={`${F.navItem} ${vista === v.id ? F.navActive : F.navIdle}`}>
              <v.icon className="size-4" /> {v.label}
            </button>
          ))}
        </nav>
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <button type="button" onClick={() => router.push('/plugins/finance?ui=clasico')} className={`${F.navItem} ${F.navIdle}`}>
            <LayoutPanelTop className="size-4" /> Tablero clásico
          </button>
          <button type="button" onClick={() => router.push('/apps')} className={`${F.navItem} ${F.navIdle}`}>
            <ArrowLeft className="size-4" /> Volver a WhatsPro
          </button>
        </div>
      </aside>

      {/* Columna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior (también nav en móvil) */}
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md">
          <button type="button" onClick={() => router.push('/apps')} className={`${F.btn} ${F.btnSuave} lg:hidden`} aria-label="Volver a WhatsPro">
            <ArrowLeft className="size-4" />
          </button>
          <div className="flex flex-1 gap-1 overflow-x-auto lg:hidden">
            {VISTAS.map((v) => (
              <button key={v.id} type="button" onClick={() => setParam({ vista: v.id, cliente: null })} className={`${F.btn} whitespace-nowrap ${vista === v.id ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                {v.label}
              </button>
            ))}
          </div>
          <h1 className="hidden text-lg font-black tracking-tight lg:block">{VISTAS.find((v) => v.id === vista)?.label}</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {vista === 'resumen' && <ResumenView onAbrirCliente={abrirCliente} onIrA={(v) => setParam({ vista: v })} />}
          {vista === 'movimientos' && <MovimientosView />}
          {vista === 'cobros' && <CobrosView onAbrirCliente={abrirCliente} />}
          {vista === 'membresias' && <MembresiasView onAbrirCliente={abrirCliente} />}
          {vista === 'clientes' && (
            <ClientesView
              clienteId={searchParams.get('cliente') ? Number(searchParams.get('cliente')) : null}
              onAbrirCliente={abrirCliente}
              onCerrarCliente={() => setParam({ cliente: null })}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export function FinanzasApp() {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-background" />}>
      <AppInterna />
    </Suspense>
  );
}
