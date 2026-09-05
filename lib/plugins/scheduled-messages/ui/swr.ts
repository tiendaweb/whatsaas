'use client';

/**
 * La forma ÚNICA con la que se piden los mensajes programados del equipo.
 *
 * SWR cachea por clave, no por fetcher: dos componentes que pidan esta misma URL
 * con fetchers que devuelvan formas distintas se pisan, y el que pierde la
 * carrera recibe la forma del otro. Eso ya rompió una pantalla (el Focus leía un
 * array y le llegaba `{disponible, rows}`, y `.find` no existía), y como la
 * caché de SWR sobrevive a la navegación del lado del cliente, alcanzaba con
 * pasar de una app a la otra para reproducirlo.
 *
 * Así que la clave y el fetcher viven acá, y los importa todo el que los use.
 *
 * `disponible: false` es 401/403/404: el plugin está apagado o la persona no
 * tiene el permiso. No es un error que pueda arreglar desde la pantalla, así que
 * quien lo consume oculta su sección en vez de mostrar un cartel rojo.
 */
export const PROGRAMADOS_API = '/api/plugins/scheduled-messages';

export type RespuestaProgramados<T> = { disponible: boolean; rows: T[] };

export async function programadosFetcher<T>(url: string): Promise<RespuestaProgramados<T>> {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 401 || res.status === 403 || res.status === 404) return { disponible: false, rows: [] };
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const rows = await res.json();
  return { disponible: true, rows: Array.isArray(rows) ? rows : [] };
}
