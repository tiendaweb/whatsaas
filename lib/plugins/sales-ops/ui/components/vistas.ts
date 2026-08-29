export const VISTAS = ['hoy', 'dinero', 'oportunidades', 'barrido', 'limpieza', 'respuestas', 'cola', 'todos', 'experimentos', 'prompts', 'metricas'] as const;
export type Vista = (typeof VISTAS)[number];

export const VISTA_LABELS: Record<Vista, string> = {
  hoy: 'Hoy',
  dinero: 'Dinero',
  oportunidades: 'Oportunidades',
  barrido: 'Barrido',
  limpieza: 'Limpieza',
  respuestas: 'Respuestas',
  cola: 'Cola',
  todos: 'Todos',
  experimentos: 'Experimentos',
  prompts: 'Prompt Studio',
  metricas: 'Métricas',
};

export function isVista(v: unknown): v is Vista {
  return typeof v === 'string' && (VISTAS as readonly string[]).includes(v);
}
