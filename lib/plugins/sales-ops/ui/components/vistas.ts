export const VISTAS = ['hoy', 'focus', 'noelia', 'dinero', 'oportunidades', 'barrido', 'limpieza', 'respuestas', 'cola', 'audios', 'programados', 'produccion', 'todos', 'clientes', 'experimentos', 'prompts', 'metricas', 'ayuda'] as const;
export type Vista = (typeof VISTAS)[number];

/**
 * Vistas que NO aparecen en el rail.
 *
 * Experimentos es una herramienta de medición que se usa una vez cada tanto,
 * no un lugar al que se entra todos los días: ocupaba un renglón fijo del menú
 * compitiendo con las listas de trabajo. Sigue existiendo como vista y se llega
 * desde el Prompt Studio, que es donde uno está cuando piensa en probar dos
 * textos distintos.
 */
/**
 * `focus` tampoco: no es un lugar del menú sino un modo de trabajo que se toma
 * a pantalla completa desde el botón de la barra. Ponerlo en el rail lo dejaría
 * al lado de las listas, como si fuera otra lista.
 *
 * `ayuda` tampoco: vive en el pie del menú, junto a Plegar y Volver a WhatsPro.
 * `clientes` (Contactos) se llega desde un botón dentro de Todos: es un corte de
 * la misma lista, no otro lugar.
 */
export const VISTAS_OCULTAS: readonly Vista[] = ['experimentos', 'ayuda', 'clientes', 'focus', 'noelia'];

/** Las que se dibujan en el rail y en la barra inferior. */
export const VISTAS_VISIBLES = VISTAS.filter((v) => !VISTAS_OCULTAS.includes(v));

export const VISTA_LABELS: Record<Vista, string> = {
  hoy: 'Hoy',
  focus: 'Focus',
  noelia: 'Modo Noelia',
  dinero: 'Dinero',
  oportunidades: 'Oportunidades',
  barrido: 'Barrido',
  limpieza: 'Limpieza',
  respuestas: 'Respuestas',
  cola: 'Cola',
  audios: 'Audios',
  programados: 'Programados',
  produccion: 'Producción',
  todos: 'Todos',
  clientes: 'Contactos',
  experimentos: 'Experimentos',
  prompts: 'Prompt Studio',
  metricas: 'Métricas',
  ayuda: 'Ayuda',
};

export function isVista(v: unknown): v is Vista {
  return typeof v === 'string' && (VISTAS as readonly string[]).includes(v);
}
