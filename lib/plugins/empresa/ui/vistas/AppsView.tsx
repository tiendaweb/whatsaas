'use client';

import {
  BadgeDollarSign,
  CalendarDays,
  ExternalLink,
  FileStack,
  Files,
  Globe,
  Server,
  FileSignature,
  LifeBuoy,
  Package,
  PieChart,
  Plug,
  ShoppingCart,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResumenEmpresa } from '../../shared/api-types';
import { APPS_AGRUPADAS, SECTOR_LABELS, type SectorId, type Vista } from '../../shared/vistas';
import { CH, TONOS, type Tono } from '../estilo';
import { fmtInt } from '../componentes/format';

const ICONOS: Record<string, LucideIcon> = {
  BadgeDollarSign,
  ShoppingCart,
  UserCog,
  LifeBuoy,
  Package,
  PieChart,
  Globe,
  Server,
  FileStack,
  Files,
  CalendarDays,
};

const TONO_POR_SECTOR: Record<SectorId, Tono> = {
  plata: 'emerald',
  gente: 'sky',
  catalogo: 'slate',
  activos: 'violet',
  trabajo: 'amber',
};

/** Qué dice el numerito de cada mosaico. */
const LEYENDA: Record<string, string> = {
  finanzasPorCobrar: 'sin cobrar',
  comprasPendientes: 'pendientes',
  soporteAbiertos: 'abiertos',
  articulos: 'artículos',
};

/**
 * Las apps que Empresa agrupa pero no reescribe.
 *
 * Se muestran sólo las que el equipo tiene activas: un mosaico que lleva a un
 * 404 es peor que no ofrecer el camino. Contratos no está acá porque sí tiene
 * vista propia adentro de Empresa; su número aparece igual, como aviso.
 */
export function SectoresDeApps({ apps, onChangeVista }: { apps: ResumenEmpresa['apps']; onChangeVista: (v: Vista) => void }) {
  const activas = new Set(apps.activas);
  const sectores = (Object.keys(SECTOR_LABELS) as SectorId[])
    .map((sector) => ({ sector, items: APPS_AGRUPADAS.filter((app) => app.sector === sector && activas.has(app.pluginId)) }))
    .filter((grupo) => grupo.items.length > 0);

  if (sectores.length === 0) {
    return null;
  }

  return (
    <section className={cn('p-5', CH.card)} aria-label="Apps de la empresa">
      <h2 className={CH.rotulo}>Apps del negocio</h2>
      <div className="mt-3 space-y-4">
        {sectores.map(({ sector, items }) => (
          <div key={sector}>
            <p className="text-[11px] font-semibold text-muted-foreground">{SECTOR_LABELS[sector]}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {items.map((app) => {
                const Icon = ICONOS[app.icono] ?? Plug;
                const n = app.contador ? apps.contadores[app.contador] : undefined;
                return (
                  <a
                    key={app.pluginId}
                    href={app.href}
                    className="group flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/40"
                  >
                    <span className={cn(CH.iconoCaja, TONOS[TONO_POR_SECTOR[sector]])}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-foreground">{app.label}</span>
                        <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">{app.descripcion}</span>
                    </span>
                    {typeof n === 'number' && n > 0 && (
                      <span className="shrink-0 text-right">
                        <span className="block text-base font-bold tabular-nums leading-none text-foreground">{fmtInt(n)}</span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">{app.contador ? LEYENDA[app.contador] : ''}</span>
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        ))}

        {apps.contratosPorVencer > 0 && (
          <button
            type="button"
            onClick={() => onChangeVista('contratos')}
            className="flex w-full items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-left transition-colors hover:bg-amber-500/15"
          >
            <span className={cn(CH.iconoCaja, TONOS.amber)}>
              <FileSignature className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                {fmtInt(apps.contratosPorVencer)} {apps.contratosPorVencer === 1 ? 'contrato vence' : 'contratos vencen'} en 60 días
              </span>
              <span className="block text-[11px] text-muted-foreground">Revisá si se renuevan antes de que caigan.</span>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}

/** La vista Apps del rail: los mismos sectores, sin el resto del Inicio. */
export function AppsView({ apps, onChangeVista }: { apps: ResumenEmpresa['apps']; onChangeVista: (v: Vista) => void }) {
  const activas = new Set(apps.activas);
  const ninguna = APPS_AGRUPADAS.every((app) => !activas.has(app.pluginId));

  if (ninguna) {
    return (
      <div className={cn('p-8 text-center', CH.card)}>
        <p className="text-sm font-medium text-foreground">No tenés ninguna app agrupada activa</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Finanzas, Compras, RRHH, Soporte, Artículos e Inteligencia se activan desde la configuración de aplicaciones del equipo.
        </p>
      </div>
    );
  }

  return <SectoresDeApps apps={apps} onChangeVista={onChangeVista} />;
}

/**
 * Las mismas apps, con la caja del tablero.
 *
 * El Inicio pasó a dibujarse a pantalla completa con el vocabulario de la
 * maqueta (`cabina.css`), donde no hay tokens de Tailwind sino `--ce-*`; meter
 * ahí la versión de arriba dejaba un bloque con otro borde, otro radio y otro
 * gris justo al final de la pantalla. El catálogo —qué apps hay, qué contador
 * lleva cada una— es el mismo `APPS_AGRUPADAS` y por eso las dos versiones
 * viven en este archivo: lo que cambia es la ropa, no la lista.
 */
export function SectoresDeAppsCabina({ apps, onChangeVista }: { apps: ResumenEmpresa['apps']; onChangeVista: (v: Vista) => void }) {
  const activas = new Set(apps.activas);
  const sectores = (Object.keys(SECTOR_LABELS) as SectorId[])
    .map((sector) => ({ sector, items: APPS_AGRUPADAS.filter((app) => app.sector === sector && activas.has(app.pluginId)) }))
    .filter((grupo) => grupo.items.length > 0);

  if (sectores.length === 0 && apps.contratosPorVencer === 0) return null;

  return (
    <div className="panel">
      <div className="panel-h"><h3>Apps del negocio</h3></div>

      {sectores.map(({ sector, items }) => (
        <div key={sector} style={{ marginBottom: 14 }}>
          <div className="ctx-t">{SECTOR_LABELS[sector]}</div>
          {items.map((app) => {
            const Icon = ICONOS[app.icono] ?? Plug;
            const n = app.contador ? apps.contadores[app.contador] : undefined;
            return (
              <a key={app.pluginId} href={app.href} className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Icon className="size-4 shrink-0" style={{ color: 'var(--ce-muted)' }} aria-hidden />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nm">{app.label}</div>
                  <div className="sub2">{app.descripcion}</div>
                </div>
                {typeof n === 'number' && n > 0 && (
                  <div className="der">
                    <div className="mono" style={{ fontWeight: 700 }}>{fmtInt(n)}</div>
                    <div className="sub2">{app.contador ? LEYENDA[app.contador] : ''}</div>
                  </div>
                )}
              </a>
            );
          })}
        </div>
      ))}

      {apps.contratosPorVencer > 0 && (
        <button
          type="button"
          onClick={() => onChangeVista('contratos')}
          className="btn"
          style={{ width: '100%', justifyContent: 'flex-start', gap: 9 }}
        >
          <FileSignature className="size-4 shrink-0" style={{ color: '#f5a524' }} aria-hidden />
          <span style={{ textAlign: 'left' }}>
            {fmtInt(apps.contratosPorVencer)} {apps.contratosPorVencer === 1 ? 'contrato vence' : 'contratos vencen'} en 60 días
          </span>
        </button>
      )}
    </div>
  );
}
