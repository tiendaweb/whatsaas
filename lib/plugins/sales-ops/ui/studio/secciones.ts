import { Activity, FlaskConical, LayoutGrid, PenLine, type LucideIcon } from 'lucide-react';

/**
 * Secciones del Prompt Studio.
 *
 * Son cuatro y en este orden porque responden a las cuatro preguntas con las
 * que se entra, de la más frecuente a la más rara: qué hay (Biblioteca), armar
 * una corrida con datos (Componer), qué pasó con lo que lancé (Actividad) y
 * medir dos textos (Experimentos).
 *
 * La sección viaja en la URL (`/plugins/sales-ops/studio/<seccion>`), así se
 * comparte un enlace a "Actividad" sin pedirle a nadie que navegue.
 */
export const SECCIONES = ['biblioteca', 'componer', 'actividad', 'experimentos'] as const;
export type Seccion = (typeof SECCIONES)[number];

export const SECCION_LABELS: Record<Seccion, string> = {
  biblioteca: 'Biblioteca',
  componer: 'Componer',
  actividad: 'Actividad',
  experimentos: 'Experimentos',
};

/** La línea de abajo del encabezado: qué se hace en cada sección. */
export const SECCION_BAJADAS: Record<Seccion, string> = {
  biblioteca: 'Las skills del equipo: prompts guardados con nombre, formulario y motor.',
  componer: 'Completá los datos de una skill y mirá el prompt final antes de lanzarlo.',
  actividad: 'Todo lo que se lanzó: en cola, sin cuota, fallado y hecho.',
  experimentos: 'Dos textos, la misma situación, y cuál convierte mejor.',
};

export const SECCION_ICONS: Record<Seccion, LucideIcon> = {
  biblioteca: LayoutGrid,
  componer: PenLine,
  actividad: Activity,
  experimentos: FlaskConical,
};

export function isSeccion(v: unknown): v is Seccion {
  return typeof v === 'string' && (SECCIONES as readonly string[]).includes(v);
}
