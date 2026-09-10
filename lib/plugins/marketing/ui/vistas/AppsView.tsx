'use client';

import {
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileStack,
  FileText,
  Files,
  LayoutTemplate,
  Megaphone,
  PieChart,
  Plug,
  Send,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResumenMarketing } from '../../shared/api-types';
import { APPS_AGRUPADAS, SECTOR_LABELS, type SectorId } from '../../shared/vistas';
import { CH, TONOS, type Tono } from '../estilo';
import { fmtInt } from '../componentes/format';

const ICONOS: Record<string, LucideIcon> = {
  CalendarDays,
  Megaphone,
  PieChart,
  Send,
  Share2,
  FileStack,
  Files,
  FileText,
  ClipboardList,
  LayoutTemplate,
};

const TONO_POR_SECTOR: Record<SectorId, Tono> = {
  publicidad: 'violet',
  contenido: 'rose',
  captacion: 'amber',
  medicion: 'sky',
};

/** Qué dice el numerito de cada mosaico. */
const LEYENDA: Record<string, string> = {
  metaCampanasActivas: 'activas',
  difusionCampanas: 'campañas',
  publicacionesProgramadas: 'programadas',
  formulariosEnvios: 'envíos',
  borradores: 'guardados',
};

/**
 * Las apps que Marketing agrupa pero no reescribe.
 *
 * Se muestran sólo las que el equipo tiene activas: un mosaico que lleva a un
 * 404 es peor que no ofrecer el camino. Las rutas del producto (Difusión,
 * Borradores, Plantillas) no se activan por plugin y están siempre.
 */
export function SectoresDeApps({ apps }: { apps: ResumenMarketing['apps'] }) {
  const activas = new Set(apps.activas);
  const sectores = (Object.keys(SECTOR_LABELS) as SectorId[])
    .map((sector) => ({ sector, items: APPS_AGRUPADAS.filter((app) => app.sector === sector && activas.has(app.href)) }))
    .filter((grupo) => grupo.items.length > 0);

  if (sectores.length === 0) return null;

  return (
    <div className="space-y-5">
      {sectores.map(({ sector, items }) => (
        <section key={sector} aria-labelledby={`sector-${sector}`} className="space-y-2">
          <h2 id={`sector-${sector}`} className={CH.rotulo}>
            {SECTOR_LABELS[sector]}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((app) => {
              const Icono = ICONOS[app.icono] ?? Plug;
              const n = app.contador ? apps.contadores[app.contador] : undefined;
              return (
                <a
                  key={app.href}
                  href={app.href}
                  className={cn(CH.card, 'group flex items-start gap-3 p-3 transition-colors hover:bg-muted/40')}
                >
                  <span className={cn(CH.iconoCaja, TONOS[TONO_POR_SECTOR[sector]])}>
                    <Icono className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">{app.label}</span>
                      <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </span>
                    <span className={cn(CH.ayuda, 'block')}>{app.descripcion}</span>
                    {typeof n === 'number' && n > 0 && (
                      <span className="mt-1 inline-block text-[11px] font-semibold tabular-nums text-foreground">
                        {fmtInt(n)} <span className="font-medium text-muted-foreground">{LEYENDA[app.contador ?? ''] ?? ''}</span>
                      </span>
                    )}
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function AppsView({ apps }: { apps: ResumenMarketing['apps'] }) {
  return <SectoresDeApps apps={apps} />;
}
