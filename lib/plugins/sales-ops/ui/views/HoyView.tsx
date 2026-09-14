'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { LayoutDashboard, Newspaper, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { OverviewPayload } from '../../shared/api-types';
import type { OwnerFilterValue } from '../components/OwnerFilter';
import { ErrorState } from '../components/States';
import type { Vista } from '../components/vistas';
import { SALES_OPS_API, fetcher } from '../components/format';
import { AccionesHoy } from '../hoy/AccionesHoy';
import { MuroView } from '../hoy/MuroView';
import { PanelHoy } from '../hoy/PanelHoy';

type Seccion = 'panel' | 'acciones' | 'muro';

const LS_SECCION = 'sales-ops:hoy-seccion';

const SECCIONES: Array<{ id: Seccion; label: string; icon: LucideIcon }> = [
  { id: 'panel', label: 'Panel', icon: LayoutDashboard },
  { id: 'acciones', label: 'Acciones', icon: Zap },
  { id: 'muro', label: 'Muro', icon: Newspaper },
];

type Props = {
  owner: OwnerFilterValue;
  onChangeVista: (vista: Vista) => void;
  onOpen: (chatId: number) => void;
};

/**
 * Hoy, en tres pestañas.
 *
 * Era una sola columna larguísima: meta de caja, seis contadores, auditoría,
 * siguiente acción y distribución, uno abajo del otro. En el celular la lista
 * de trabajo —lo único que se toca— quedaba tres pantallas más abajo que los
 * números que sólo se miran.
 *
 * Panel es "cómo venimos", Acciones es "qué hago ahora" y Muro es "qué se hizo
 * ya" (incluido lo que corrieron los conectores mientras nadie miraba). La
 * pestaña elegida se recuerda: si alguien vive en el Muro, entra al Muro.
 */
export function HoyView({ owner, onChangeVista, onOpen }: Props) {
  const [seccion, setSeccion] = useState<Seccion>('panel');
  const { data, error, isLoading, mutate } = useSWR<OverviewPayload>(`${SALES_OPS_API}/overview`, fetcher, { refreshInterval: 60_000 });

  useEffect(() => {
    try {
      const guardada = window.localStorage.getItem(LS_SECCION);
      if (guardada === 'panel' || guardada === 'acciones' || guardada === 'muro') setSeccion(guardada);
    } catch {
      /* sin storage */
    }
  }, []);

  const elegir = (id: Seccion) => {
    setSeccion(id);
    try {
      window.localStorage.setItem(LS_SECCION, id);
    } catch {
      /* sin storage */
    }
  };

  const nextBest = useMemo(() => {
    const rows = data?.nextBest ?? [];
    // El filtro global sólo recorta la lista; los contadores son del equipo entero.
    return owner === 'todos' ? rows : rows.filter((r) => r.owner === owner);
  }, [data, owner]);

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 rounded-2xl border border-border bg-muted/40 p-1" aria-label="Secciones de Hoy">
        {SECCIONES.map(({ id, label, icon: Icon }) => {
          const activa = seccion === id;
          const badge = id === 'acciones' && nextBest.length > 0 ? nextBest.length : null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => elegir(id)}
              aria-current={activa ? 'page' : undefined}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors',
                activa ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
              {badge !== null && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    activa ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-foreground/10 text-foreground',
                  )}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* El Muro tiene su propia carga y no depende del resumen: si `overview`
          falla, el historial se sigue pudiendo leer. */}
      {seccion === 'muro' ? (
        <MuroView onOpen={onOpen} />
      ) : error ? (
        <ErrorState message={String(error.message ?? error)} onRetry={() => void mutate()} />
      ) : isLoading || !data ? (
        <HoySkeleton />
      ) : seccion === 'panel' ? (
        <PanelHoy data={data} onChangeVista={onChangeVista} />
      ) : (
        <AccionesHoy items={nextBest} analizados={data.audit.analyzed} onOpen={onOpen} onChangeVista={onChangeVista} />
      )}
    </div>
  );
}

function HoySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}
