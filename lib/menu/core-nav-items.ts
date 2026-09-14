export type CoreNavItemDef = {
  key: string;
  href: string;
  icon: string;
  label: string;
  description: string;
  feature: string | null;
  permissionKey: string | null;
  order: number;
};

/**
 * Ojo con lo que NO está acá: la vista clásica de tareas (`/dashboard?view=tasks`)
 * vive dentro de Tareas OS. Salió del menú y del lanzador, pero la ruta sigue
 * respondiendo: los enlaces guardados y los favoritos siguen abriendo lo mismo.
 *
 * Seguimiento sí está: es su propia app (`/seguimiento`, agenda por etapa con
 * chat lateral) y no la contiene ninguna otra. Lo que el Command Center tiene
 * son los filtros «con/sin seguimiento» de la vista Contactos, que es otra cosa.
 */
export const CORE_NAV_ITEMS: CoreNavItemDef[] = [
  { key: '/dashboard', href: '/dashboard', icon: 'MessageCircle', label: 'Chats', description: 'Bandeja de conversaciones de WhatsApp.', feature: null, permissionKey: null, order: 0 },
  { key: '/automation', href: '/automation', icon: 'Zap', label: 'Automatización', description: 'Flujos y automatizaciones del negocio.', feature: 'isFlowBuilderEnabled', permissionKey: 'automation', order: 1 },
  { key: '/settings/ai', href: '/settings/ai', icon: 'Bot', label: 'Agente IA', description: 'Configuración del agente de inteligencia artificial.', feature: 'isAiEnabled', permissionKey: 'aiAgent', order: 2 },
  { key: '/contacts', href: '/contacts', icon: 'Users', label: 'Contactos', description: 'Directorio de contactos y clientes.', feature: null, permissionKey: 'contacts', order: 3 },
  { key: '/seguimiento', href: '/seguimiento', icon: 'Target', label: 'Seguimiento', description: 'Agenda de contactos por etapa del embudo, con chat lateral.', feature: null, permissionKey: 'contacts', order: 4 },
  { key: '/drafts', href: '/drafts', icon: 'FileText', label: 'Borradores', description: 'Mensajes guardados como borrador.', feature: null, permissionKey: 'drafts', order: 5 },
  { key: '/analytics', href: '/analytics', icon: 'PieChart', label: 'Analytics', description: 'Métricas y reportes del equipo.', feature: null, permissionKey: null, order: 6 },
  { key: '/templates', href: '/templates', icon: 'LayoutTemplate', label: 'Plantillas', description: 'Plantillas de mensajes de WhatsApp.', feature: 'isTemplatesEnabled', permissionKey: 'templates', order: 7 },
  { key: '/campaigns', href: '/campaigns', icon: 'Megaphone', label: 'Campañas', description: 'Campañas de difusión masiva.', feature: 'isCampaignsEnabled', permissionKey: 'campaigns', order: 8 },
];

// Fuente compartida por escritorio, móvil, el editor de menú y el lanzador.
// Estos plugins viven por defecto en Apps en lugar del sidebar principal.
export const APPS_LAUNCHER_PREFIXES = [
  '/plugins/notes', '/plugins/calendar', '/plugins/domains',
  '/plugins/articles', '/plugins/sales', '/plugins/customers', '/plugins/memberships',
  '/plugins/aapp-space',
  '/plugins/deals', '/plugins/tasks', '/plugins/scheduled-messages', '/plugins/mini-apps', '/plugins/app-maker',
  '/plugins/form-builder', '/plugins/radar',
  '/plugins/hostinger', '/plugins/meta-ads', '/plugins/documents', '/plugins/files', '/escritorio',
  '/plugins/sites',
  '/plugins/finance',
  '/plugins/purchases', '/plugins/hr', '/plugins/support', '/plugins/contracts', '/plugins/intelligence',
  '/plugins/gemini',
  '/plugins/chatgpt-connector', '/plugins/grok-connector', '/plugins/claude-code-connector',
  // El Prompt Studio es app aparte del Command Center: vive en el lanzador, no
  // en el menú principal, donde compitiría con la bandeja y el Command Center.
  '/plugins/sales-ops/studio',
  // El Centro de Desarrollo es de uso puntual y de una sola persona: vive en
  // el lanzador, no ocupando un renglón del menú de todos los días.
  '/plugins/dev-center',
  // Publicaciones se abre cuando se programa contenido, no todos los días.
  '/plugins/social-publisher',
];

/**
 * Destinos que siempre viven dentro de /apps. Las preferencias históricas no
 * pueden volver a fijarlos en el sidebar: hay equipos con overrides anteriores
 * a la creación del lanzador y, sin esta regla, cada cliente ve un menú distinto.
 */
export const APPS_ONLY_ITEM_KEYS = [
  '/plugins/gemini',
  '/plugins/memberships/subscriptions',
  '/plugins/memberships/companies',
  '/plugins/memberships/plans',
  // APP MAKER y Publicaciones son herramientas de construcción y de campaña:
  // se entran por el lanzador. Van acá y no sólo en APPS_LAUNCHER_PREFIXES
  // porque el equipo ya tenía overrides que los volvían a fijar en el menú.
  '/plugins/app-maker',
  '/plugins/social-publisher',
] as const;

export const COMMAND_CENTER_HREF = '/plugins/sales-ops';

/**
 * Los hubs que agrupan aplicaciones enteras. Van SIEMPRE en el menú principal.
 *
 * Un hub adentro del lanzador de apps es una contradicción: es el lugar desde
 * donde se llega a las apps, no una más de ellas. Además, como se quedan con
 * los accesos de lo que agrupan (Finanzas ya no aparece suelta), si el hub
 * quedara escondido en /apps habría que entrar a dos pantallas para llegar a lo
 * que antes estaba a un clic.
 */
export const HUB_LABELS: Record<string, string> = {
  '/plugins/empresa': 'Empresa',
  '/plugins/marketing': 'Marketing',
  '/plugins/ia': 'IA',
  '/plugins/app-maker': 'APP MAKER',
};

export function isAppsOnlyItem(href: string): boolean {
  return APPS_ONLY_ITEM_KEYS.includes(href as (typeof APPS_ONLY_ITEM_KEYS)[number]);
}

export function isMainNavOnlyItem(href: string): boolean {
  // Estar en el lanzador y sólo ahí gana sobre ser hub: APP MAKER agrupa las
  // apps publicadas (por eso sigue en HUB_LABELS y sus apps no se sueltan en
  // el lanzador), pero no ocupa un renglón del menú de todos los días.
  if (isAppsOnlyItem(href)) return false;
  return href === COMMAND_CENTER_HREF || href in HUB_LABELS;
}

/** Bandeja, Command Center, los hubs; el resto conserva el orden del equipo. */
export function compareMainNavigation(
  a: { href: string; order: number },
  b: { href: string; order: number },
): number {
  const priority = (href: string) => href === '/dashboard' ? 0 : href === COMMAND_CENTER_HREF ? 1 : href in HUB_LABELS ? 2 : 3;
  return priority(a.href) - priority(b.href) || a.order - b.order;
}

export type MenuOverride = { itemKey: string; pinned: boolean; order: number };
