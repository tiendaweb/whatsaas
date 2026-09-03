import type { RadarIcon } from './blocks';

/**
 * El icono sigue al significado del elemento, no a su origen (IA/Radar).
 * Estas reglas sólo actúan cuando el conector omitió el icono o mandó uno que
 * la versión actual de lucide-react no puede resolver.
 */
const SEMANTIC_ICON_RULES: Array<{ terms: string[]; icon: RadarIcon }> = [
  { terms: ['error', 'falla', 'bug', 'problema', 'roto'], icon: 'Bug' },
  { terms: ['riesgo', 'alerta', 'urgente', 'vencid', 'critico'], icon: 'AlertTriangle' },
  { terms: ['cobro', 'pago', 'factura', 'dinero', 'saldo'], icon: 'Wallet' },
  { terms: ['venta', 'cierre', 'oportunidad', 'conversion'], icon: 'Target' },
  { terms: ['caliente', 'p1', 'prioridad', 'foco'], icon: 'Flame' },
  { terms: ['seguimiento', 'pendiente', 'tarea', 'proxima'], icon: 'ListTodo' },
  { terms: ['agenda', 'calendario', 'hoy', 'fecha'], icon: 'CalendarDays' },
  { terms: ['cliente', 'contacto', 'persona', 'equipo', 'usuario'], icon: 'Users' },
  { terms: ['chat', 'mensaje', 'conversacion', 'respuesta'], icon: 'MessagesSquare' },
  { terms: ['informe', 'reporte', 'documento'], icon: 'ScrollText' },
  { terms: ['archivo', 'carpeta', 'biblioteca', 'banco'], icon: 'FolderOpen' },
  { terms: ['rendimiento', 'tendencia', 'crecimiento', 'evolucion'], icon: 'TrendingUp' },
  { terms: ['score', 'puntaje', 'confianza', 'medicion'], icon: 'Gauge' },
  { terms: ['embudo', 'filtro', 'segmento'], icon: 'Filter' },
  { terms: ['mejora', 'correccion', 'ajuste'], icon: 'Wrench' },
  { terms: ['trabajo', 'proyecto', 'entrega'], icon: 'Briefcase' },
  { terms: ['mapa', 'ruta', 'recorrido', 'etapa'], icon: 'Route' },
  { terms: ['analisis', 'recomendacion', 'insight', 'inteligencia', 'ia'], icon: 'Brain' },
  { terms: ['app', 'aplicacion', 'portal', 'vista'], icon: 'LayoutGrid' },
];

function searchable(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Devuelve un fallback estable y semántico a partir del texto visible. */
export function inferRadarIcon(
  values: Array<string | null | undefined>,
  fallback: RadarIcon = 'CircleHelp',
): RadarIcon {
  const haystack = searchable(values.filter(Boolean).join(' '));
  const match = SEMANTIC_ICON_RULES.find((rule) => rule.terms.some((term) => haystack.includes(term)));
  return match?.icon ?? fallback;
}
