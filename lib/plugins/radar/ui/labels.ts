// Etiquetas legibles para los valores cerrados de CLASSIFICATION.md (documento
// 04 de la carpeta Radar App en Documentos). No inventar valores nuevos acá:
// si algo no está en este mapa, se muestra tal cual vino del CRM.

export const INTENCION_LABEL: Record<string, string> = {
  compra_activa: 'Compra activa',
  evaluando: 'Evaluando',
  curiosidad: 'Curiosidad',
  sin_intencion: 'Sin intención',
};

export const OBJECION_LABEL: Record<string, string> = {
  precio: 'Precio',
  presupuesto: 'Presupuesto',
  confianza: 'Confianza',
  timing: 'Timing',
  desaparecio: 'Desapareció',
  decision_tercero: 'Depende de un tercero',
  sin_objecion: 'Sin objeción',
  otra: 'Otra',
};

export const RECUPERABILIDAD_LABEL: Record<string, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
  nula: 'Nula',
};

export const PRIORIDAD_BADGE: Record<string, { label: string; className: string }> = {
  P1: { label: 'P1 · Hoy', className: 'bg-rose-500 text-white' },
  P2: { label: 'P2 · Esta semana', className: 'bg-amber-500 text-white' },
  P3: { label: 'P3 · Nutrición', className: 'bg-neutral-400 text-white' },
  descartado: { label: 'Descartado', className: 'bg-neutral-300 text-neutral-700' },
};

export function humanize(map: Record<string, string>, value: string | null) {
  if (!value) return null;
  return map[value] ?? value;
}
