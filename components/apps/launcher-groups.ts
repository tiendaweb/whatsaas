/**
 * Los grupos con los que el lanzador de escritorio ordena las aplicaciones.
 *
 * El catálogo (`launcher-catalog.ts`) sabe qué apps existen, pero no en qué
 * parte del negocio vive cada una: sin grupos el modal es una grilla de
 * veintitantos mosaicos donde encontrar "Compras" cuesta lo mismo que
 * encontrar "Gemini". El orden de `ORDEN_GRUPOS` es el orden en que se
 * dibujan las secciones.
 *
 * Una app que no esté acá cae en «Otras aplicaciones»: sumar un plugin nuevo
 * nunca lo deja afuera del lanzador, sólo lo deja sin sección propia hasta
 * que alguien la asigne.
 */

export const ORDEN_GRUPOS = [
  'Operación',
  'Negocio',
  'Finanzas',
  'Marketing',
  'Web y dominios',
  'IA y conectores',
  'Constructores',
  'Otras aplicaciones',
] as const;

export type GrupoDeApps = (typeof ORDEN_GRUPOS)[number];

/** Prefijo de ruta → grupo. Se compara del más largo al más corto. */
const GRUPO_POR_PREFIJO: Record<string, GrupoDeApps> = {
  '/dashboard': 'Operación',
  '/escritorio': 'Operación',
  '/escritorio/bandeja': 'Operación',
  '/seguimiento': 'Operación',
  '/contacts': 'Operación',
  '/todosloscontactos': 'Operación',
  '/drafts': 'Operación',
  '/automation': 'Operación',
  '/templates': 'Operación',
  '/plugins/tasks': 'Operación',
  '/plugins/notes': 'Operación',
  '/plugins/calendar': 'Operación',
  '/plugins/documents': 'Operación',
  '/plugins/files': 'Operación',
  '/plugins/scheduled-messages': 'Operación',
  '/plugins/sales-ops': 'Operación',

  '/plugins/empresa': 'Negocio',
  '/plugins/customers': 'Negocio',
  '/plugins/sales': 'Negocio',
  '/plugins/deals': 'Negocio',
  '/plugins/memberships': 'Negocio',
  '/plugins/contracts': 'Negocio',
  '/plugins/hr': 'Negocio',
  '/plugins/purchases': 'Negocio',
  '/plugins/support': 'Negocio',

  '/analytics': 'Finanzas',
  '/plugins/finance': 'Finanzas',
  '/plugins/intelligence': 'Finanzas',
  '/plugins/radar': 'Finanzas',

  '/campaigns': 'Marketing',
  '/plugins/marketing': 'Marketing',
  '/plugins/meta-ads': 'Marketing',
  '/plugins/articles': 'Marketing',
  '/plugins/form-builder': 'Marketing',
  '/plugins/social-publisher': 'Marketing',

  '/plugins/sites': 'Web y dominios',
  '/plugins/domains': 'Web y dominios',
  '/plugins/hostinger': 'Web y dominios',
  '/plugins/aapp-space': 'Web y dominios',

  '/plugins/ia': 'IA y conectores',
  '/plugins/gemini': 'IA y conectores',
  '/plugins/grok-connector': 'IA y conectores',
  '/plugins/claude-code-connector': 'IA y conectores',
  '/plugins/chatgpt-connector': 'IA y conectores',
  '/plugins/dev-center': 'IA y conectores',

  '/plugins/app-maker': 'Constructores',
  '/plugins/mini-apps': 'Constructores',
  '/plugins/marketplace': 'Constructores',
};

const PREFIJOS_ORDENADOS = Object.keys(GRUPO_POR_PREFIJO).sort((a, b) => b.length - a.length);

export function grupoDeApp(href: string): GrupoDeApps {
  for (const prefijo of PREFIJOS_ORDENADOS) {
    if (href === prefijo || href.startsWith(`${prefijo}/`) || href.startsWith(`${prefijo}?`)) {
      return GRUPO_POR_PREFIJO[prefijo];
    }
  }
  return 'Otras aplicaciones';
}
