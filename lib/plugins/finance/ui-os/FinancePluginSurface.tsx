'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { FinanceDashboard } from '@/lib/plugins/finance/ui/FinanceDashboard';
import { F } from './estilo';
import { FinanzasApp } from './FinanzasApp';

/**
 * Puerta de entrada de /plugins/finance. Por defecto sirve Finanzas OS (la app
 * a pantalla completa); `?ui=clasico` conserva el tablero anterior con la
 * tesorería completa (cuentas, centros de costo, presupuestos), igual que hizo
 * Tareas con `?ui=clasico`.
 */
function Selector() {
  const params = useSearchParams();
  const router = useRouter();
  if (params.get('ui') === 'clasico') {
    // El layout del dashboard cede toda la pantalla a /plugins/finance, así que
    // el tablero clásico necesita su propia barra para volver.
    return (
      <div className="fixed inset-0 z-40 flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
        <div className="flex items-center gap-2 border-b border-border bg-card/60 px-4 py-2">
          <button type="button" onClick={() => router.push('/plugins/finance')} className={`${F.btn} ${F.btnSuave}`}>
            <LayoutDashboard className="size-4" /> Finanzas OS
          </button>
          <button type="button" onClick={() => router.push('/apps')} className={`${F.btn} ${F.btnSuave}`}>
            <ArrowLeft className="size-4" /> Volver a WhatsPro
          </button>
          <span className="ml-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Tablero clásico · tesorería</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <FinanceDashboard />
        </div>
      </div>
    );
  }
  return <FinanzasApp />;
}

export function FinancePluginSurface() {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-background" />}>
      <Selector />
    </Suspense>
  );
}
