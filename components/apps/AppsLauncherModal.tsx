'use client';

/**
 * El lanzador de aplicaciones de escritorio.
 *
 * Es el modal del nuevo diseño de ChatPro traído tal cual: pantalla completa
 * en penumbra, buscador arriba, y las apps del equipo en mosaicos agrupados
 * por sección. Sustituye al salto a `/apps` desde la barra lateral, que sacaba
 * a la persona de donde estaba trabajando para mostrarle una lista.
 *
 * Vive sólo en escritorio: la barra lateral que lo abre ya está detrás de
 * `hidden md:flex`, y en móvil la navegación es la hoja única de
 * `use-navigation.ts`, que no se toca.
 *
 * Las apps salen del mismo `buildLauncherApps` que alimenta `/apps`, así que
 * lo que se ve acá y lo que se ve allá nunca se separan. El catálogo y el
 * marketplace siguen viviendo en `/apps`: el pie del modal es la puerta.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import useSWR from 'swr';
import { Search, X } from 'lucide-react';
import {
  buildLauncherApps,
  type InstalledMiniApp,
  type LauncherApp,
  type PluginNavItem,
  type PublishedAppMakerApp,
} from '@/components/apps/launcher-catalog';
import { grupoDeApp, ORDEN_GRUPOS } from '@/components/apps/launcher-groups';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
};

/* Los estilos del lanzador, calcados del prototipo. Van en una etiqueta propia
 * y con prefijo `wpl-` porque son medidas exactas de ese diseño (grilla de
 * 150px, iconos de 40, textos de 10,5) que no existen como utilidades del
 * sistema y que no queremos aproximar. */
const ESTILOS = `
.wpl{position:fixed;inset:0;z-index:300;background:rgba(6,6,8,.72);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);display:flex;flex-direction:column;padding:44px 6vw;animation:wpl-fade .18s ease;color:#f0f0f2;font-family:inherit}
.wpl-top{display:flex;align-items:center;gap:14px;margin-bottom:26px}
.wpl-logo{width:34px;height:34px;border-radius:10px;background:#25D366;display:grid;place-items:center;color:#000;font-weight:900;font-size:15px;flex:none}
.wpl-brand{font-size:15px;font-weight:800;letter-spacing:-.02em}
.wpl-sub{font-size:11px;color:#7a7a8c}
.wpl-sp{flex:1}
.wpl-searchbox{position:relative;flex:1;max-width:420px}
.wpl-searchbox svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:#55555f;pointer-events:none}
.wpl-search{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.13);border-radius:12px;padding:11px 15px 11px 36px;color:#f0f0f2;font-size:14px;outline:none}
.wpl-search::placeholder{color:#55555f}
.wpl-search:focus{border-color:rgba(37,211,102,.4)}
.wpl-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border-radius:9px;font-size:12.5px;font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,.07);background:#1c1c21;color:#f0f0f2;transition:all .16s;white-space:nowrap}
.wpl-btn:hover{background:#232329;border-color:rgba(255,255,255,.13)}
.wpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;overflow-y:auto;padding-bottom:20px;align-content:start}
.wpl-sec{grid-column:1/-1;font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#55555f;margin:14px 0 2px}
.wpl-app{background:linear-gradient(160deg,rgba(255,255,255,.055),rgba(255,255,255,.015));border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:16px;cursor:pointer;transition:all .16s;display:flex;flex-direction:column;gap:10px;animation:wpl-pop .22s ease backwards;text-align:left;color:inherit;font:inherit}
.wpl-app:hover{border-color:rgba(255,255,255,.13);transform:translateY(-3px);background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02))}
.wpl-app:focus-visible{outline:2px solid rgba(37,211,102,.6);outline-offset:2px}
.wpl-app[data-abierta="true"]{border-color:rgba(37,211,102,.4)}
.wpl-ico{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;overflow:hidden}
.wpl-nm{font-size:13px;font-weight:700}
.wpl-ds{font-size:10.5px;color:#7a7a8c;line-height:1.45}
.wpl-chip{display:inline-flex;align-items:center;align-self:flex-start;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.02em;background:rgba(37,211,102,.14);color:#25D366}
.wpl-vacio{grid-column:1/-1;color:#7a7a8c;font-size:13px;padding:30px 0}
.wpl-pie{display:flex;align-items:center;gap:10px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);font-size:11.5px;color:#7a7a8c}
.wpl-link{color:#f0f0f2;font-weight:600;cursor:pointer;background:none;border:none;padding:0;font-size:11.5px}
.wpl-link:hover{color:#25D366}
@keyframes wpl-fade{from{opacity:0}to{opacity:1}}
@keyframes wpl-pop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.wpl,.wpl-app{animation:none}.wpl-app:hover{transform:none}}
`;

export function AppsLauncherModal({
  open,
  onClose,
  currentPath,
}: {
  open: boolean;
  onClose: () => void;
  currentPath: string;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  // Las apps se piden recién cuando el lanzador se abre; SWR guarda la
  // respuesta, así que la segunda apertura ya es instantánea.
  const { data: pluginNavItems, isLoading: cargandoPlugins } = useSWR<PluginNavItem[]>(
    open ? '/api/plugins/nav' : null,
    fetcher,
  );
  const { data: installedMiniApps = [], isLoading: cargandoMiniApps } = useSWR<InstalledMiniApp[]>(
    open ? '/api/mini-apps' : null,
    fetcher,
  );
  const { data: appMakerResponse } = useSWR<{ apps: PublishedAppMakerApp[] }>(
    open ? '/api/plugins/app-maker/apps?published=1' : null,
    fetcher,
  );
  const { data: menuConfig } = useSWR<{ overrides: { itemKey: string; pinned: boolean; order: number }[] }>(
    open ? '/api/menu/config' : null,
    fetcher,
  );

  const apps = useMemo(
    () => buildLauncherApps(pluginNavItems ?? [], installedMiniApps, menuConfig?.overrides ?? [], appMakerResponse?.apps ?? []),
    [appMakerResponse?.apps, installedMiniApps, menuConfig, pluginNavItems],
  );

  const termino = busqueda.trim().toLocaleLowerCase('es');
  const encontradas = termino
    ? apps.filter((app) => `${app.label} ${app.description} ${grupoDeApp(app.href)}`.toLocaleLowerCase('es').includes(termino))
    : apps;

  const secciones = useMemo(() => {
    const porGrupo = new Map<string, LauncherApp[]>();
    for (const app of encontradas) {
      const grupo = grupoDeApp(app.href);
      const previas = porGrupo.get(grupo) ?? [];
      previas.push(app);
      porGrupo.set(grupo, previas);
    }
    return ORDEN_GRUPOS
      .filter((grupo) => porGrupo.has(grupo))
      .map((grupo) => ({ grupo, apps: porGrupo.get(grupo)! }));
  }, [encontradas]);

  useEffect(() => {
    if (!open) return;
    const alTeclear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose, open]);

  // Cada apertura empieza con el buscador limpio: la búsqueda anterior no
  // tiene por qué esconder la mitad de las apps la próxima vez.
  useEffect(() => {
    if (open) setBusqueda('');
  }, [open]);

  if (!open || !montado) return null;

  const abrir = (href: string) => {
    router.push(href);
    onClose();
  };

  const estaAbierta = (href: string) => currentPath === href || currentPath.startsWith(`${href}/`);

  const cargando = cargandoPlugins || cargandoMiniApps;
  let indice = 0;

  return createPortal(
    <div className="wpl" onClick={onClose} role="dialog" aria-modal="true" aria-label="Todas las aplicaciones">
      <style>{ESTILOS}</style>

      <div className="wpl-top" onClick={(event) => event.stopPropagation()}>
        <div className="wpl-logo">W</div>
        <div>
          <div className="wpl-brand">WhatsPro</div>
          <div className="wpl-sub">Todas las aplicaciones del espacio de trabajo</div>
        </div>
        <div className="wpl-sp" />
        <div className="wpl-searchbox">
          <Search aria-hidden="true" />
          <input
            className="wpl-search"
            autoFocus
            placeholder="Buscar aplicación…"
            aria-label="Buscar aplicación"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
          />
        </div>
        <button type="button" className="wpl-btn" onClick={onClose}>
          <X className="size-3.5" />
          Cerrar
        </button>
      </div>

      <div className="wpl-grid" onClick={(event) => event.stopPropagation()}>
        {secciones.map(({ grupo, apps: appsDelGrupo }) => (
          <div key={grupo} style={{ display: 'contents' }}>
            <div className="wpl-sec">{grupo}</div>
            {appsDelGrupo.map((app) => {
              const abierta = estaAbierta(app.href);
              return (
                <button
                  key={app.href}
                  type="button"
                  className="wpl-app"
                  data-abierta={abierta}
                  style={{ animationDelay: `${(indice++) * 0.016}s` }}
                  onClick={() => abrir(app.href)}
                >
                  <span className={cn('wpl-ico bg-gradient-to-br', app.visual.gradient)}>
                    {app.visual.imageUrl ? (
                      <Image
                        src={app.visual.imageUrl}
                        alt={app.visual.imageAlt ?? app.label}
                        width={40}
                        height={40}
                        className={cn('size-6 object-contain', app.visual.invertInDark && 'invert')}
                      />
                    ) : (
                      <app.icon className={cn('size-[19px]', app.visual.iconColor)} aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    <span className="wpl-nm" style={{ display: 'block' }}>{app.label}</span>
                    <span className="wpl-ds" style={{ display: 'block' }}>{app.description}</span>
                  </span>
                  {abierta && <span className="wpl-chip">abierta</span>}
                </button>
              );
            })}
          </div>
        ))}

        {!secciones.length && (
          <div className="wpl-vacio">{cargando ? 'Cargando aplicaciones…' : 'Sin resultados'}</div>
        )}
      </div>

      <div className="wpl-pie" onClick={(event) => event.stopPropagation()}>
        <span>
          {apps.length} {apps.length === 1 ? 'aplicación disponible' : 'aplicaciones disponibles'}
        </span>
        <div className="wpl-sp" />
        <button type="button" className="wpl-link" onClick={() => abrir('/apps')}>
          Catálogo y marketplace →
        </button>
      </div>
    </div>,
    document.body,
  );
}
