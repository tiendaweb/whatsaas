import { HUB_LABELS } from './core-nav-items';
import { APPS_AGRUPADAS as APPS_EMPRESA, PLUGIN_POR_VISTA as VISTAS_EMPRESA, VISTAS_ATAJO as ATAJOS_EMPRESA } from '@/lib/plugins/empresa/shared/vistas';
import { APPS_AGRUPADAS as APPS_MARKETING, PLUGIN_POR_VISTA as VISTAS_MARKETING } from '@/lib/plugins/marketing/shared/vistas';
import { APPS_AGRUPADAS as APPS_IA, PLUGIN_POR_VISTA as VISTAS_IA } from '@/lib/plugins/ia/shared/vistas';
import { APPS_AGRUPADAS as APPS_APP_MAKER } from '@/lib/plugins/app-maker/shared/agrupadas';

/**
 * Las apps que ya viven adentro de un hub y por eso NO se repiten sueltas.
 *
 * Empresa, Marketing e IA agrupan aplicaciones enteras: Finanzas, Dominios,
 * Documentos, Meta Ads, el banco de claves. Mientras cada una siguió apareciendo además como
 * mosaico propio en el lanzador y como ítem del sidebar, el equipo tenía dos
 * caminos para lo mismo y ninguno de los dos se imponía: el lanzador terminaba
 * con veintitantos iconos y el hub parecía decorativo.
 *
 * La lista NO se escribe acá: se deriva de los `APPS_AGRUPADAS` de cada hub, que
 * es donde se decide qué agrupa cada uno. Sumar una app a un hub la saca del
 * lanzador en el mismo commit; no hay una segunda lista que se olvide de
 * actualizar.
 *
 * Una app puede estar en más de un hub (Documentos, Archivos y Calendario están
 * en los dos): `hubsDe` los devuelve todos, para poder decir dónde quedó.
 */
export { HUB_LABELS } from './core-nav-items';

const MAPA: Map<string, string[]> = (() => {
  const mapa = new Map<string, string[]>();
  const sumar = (href: string, hub: string, soloAtajo = false) => {
    // Un atajo no se queda con la app: el hub la ofrece y ella sigue en el
    // menú principal (Borradores, el Agente, las Automatizaciones).
    if (soloAtajo) return;
    const previos = mapa.get(href) ?? [];
    if (!previos.includes(hub)) previos.push(hub);
    mapa.set(href, previos);
  };
  for (const app of APPS_EMPRESA) sumar(app.href, '/plugins/empresa', app.soloAtajo === true);
  for (const app of APPS_MARKETING) sumar(app.href, '/plugins/marketing', app.soloAtajo === true);
  for (const app of APPS_IA) sumar(app.href, '/plugins/ia', app.soloAtajo === true);
  for (const app of APPS_APP_MAKER) sumar(app.href, '/plugins/app-maker', app.soloAtajo === true);
  // Una app también está agrupada cuando el hub la muestra como VISTA propia
  // —Clientes, Ventas y Contratos se abren adentro de Empresa, no en su
  // pantalla suelta—. El href de un plugin es siempre `/plugins/<id>`.
  for (const [vista, pluginId] of Object.entries(VISTAS_EMPRESA)) {
    // Las vistas de atajo (Proyectos → Tareas OS) muestran la app sin quedarse
    // con ella: sigue teniendo su propio acceso.
    if (pluginId && !ATAJOS_EMPRESA.includes(vista as never)) sumar(`/plugins/${pluginId}`, '/plugins/empresa');
  }
  for (const pluginId of Object.values(VISTAS_MARKETING)) {
    if (pluginId) sumar(`/plugins/${pluginId}`, '/plugins/marketing');
  }
  for (const pluginId of Object.values(VISTAS_IA)) {
    if (pluginId) sumar(`/plugins/${pluginId}`, '/plugins/ia');
  }
  // Los hubs mismos nunca se ocultan: son la puerta.
  for (const hub of Object.keys(HUB_LABELS)) mapa.delete(hub);
  return mapa;
})();

/**
 * Los hubs que contienen esta app. Vacío = no está agrupada.
 *
 * Una subpantalla hereda los hubs de su app (`/plugins/memberships/plans`
 * pertenece a donde pertenezca `/plugins/memberships`).
 */
export function hubsDe(href: string): string[] {
  const directo = MAPA.get(href);
  if (directo) return directo;
  for (const [agrupada, hubs] of MAPA) {
    if (href.startsWith(`${agrupada}/`)) return hubs;
  }
  return [];
}

/**
 * ¿Esta app ya vive adentro de un hub?
 *
 * Compara por prefijo porque un ítem del menú puede apuntar a una subpantalla
 * (`/plugins/memberships/planes`) de una app agrupada; si el padre está
 * agrupado, la subpantalla también.
 */
export function estaAgrupada(href: string): boolean {
  // El hub nunca se oculta: es la puerta.
  if (HUB_LABELS[href]) return false;
  if (MAPA.has(href)) return true;
  // Lo que cuelga de un hub vive adentro de él: las apps publicadas con APP
  // MAKER (`/plugins/app-maker/run/...`) no son mosaicos sueltos del lanzador,
  // que crecía solo cada vez que alguien creaba una.
  for (const hub of Object.keys(HUB_LABELS)) {
    if (href.startsWith(`${hub}/`)) return true;
  }
  for (const agrupada of MAPA.keys()) {
    if (href.startsWith(`${agrupada}/`)) return true;
  }
  return false;
}
