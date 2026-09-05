'use client';

import useSWR from 'swr';
import { ACCIONES_FOCUS, APP_DE_ACCION, type AccionFocus } from './acciones';
import { fetcher } from '../components/format';

type ItemNav = { href: string };

/**
 * Qué puede hacer realmente el conector en ESTE equipo.
 *
 * Una acción cuya app está apagada no se le ofrece: pedirle que escriba un
 * documento a un equipo sin la app de Documentos es mandarlo a fallar, y el
 * error vuelve tres minutos después como una corrida `failed` que nadie
 * entiende. Las que no dependen de ninguna app —mensaje, CRM, planificar—
 * están siempre.
 *
 * Mientras el menú no cargó se devuelve todo: es una lista para armar el texto
 * del pedido, y perder una capacidad por un parpadeo es peor que ofrecerla de
 * más un segundo.
 */
export function useCapacidades(): { permitidas: AccionFocus[]; cargando: boolean } {
  const { data, isLoading } = useSWR<ItemNav[]>('/api/plugins/nav', fetcher, { revalidateOnFocus: false });

  if (!data) return { permitidas: [...ACCIONES_FOCUS], cargando: isLoading };

  const activas = new Set(data.map((item) => item.href));
  return {
    permitidas: ACCIONES_FOCUS.filter((accion) => {
      const app = APP_DE_ACCION[accion];
      return !app || activas.has(app);
    }),
    cargando: false,
  };
}
