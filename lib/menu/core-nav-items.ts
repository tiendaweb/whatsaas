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

export const CORE_NAV_ITEMS: CoreNavItemDef[] = [
  { key: '/dashboard', href: '/dashboard', icon: 'MessageCircle', label: 'Chats', description: 'Bandeja de conversaciones de WhatsApp.', feature: null, permissionKey: null, order: 0 },
  { key: '/dashboard?view=tasks', href: '/dashboard?view=tasks', icon: 'CheckSquare', label: 'Tareas', description: 'Vista clásica de tareas vinculadas a la bandeja.', feature: null, permissionKey: 'tasksRead', order: 1 },
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
];

/**
 * Destinos que siempre viven dentro de /apps. Las preferencias históricas no
 * pueden volver a fijarlos en el sidebar: hay equipos con overrides anteriores
 * a la creación del lanzador y, sin esta regla, cada cliente ve un menú distinto.
 */
export const APPS_ONLY_ITEM_KEYS = [
  '/dashboard?view=tasks',
  '/plugins/gemini',
  '/plugins/memberships/subscriptions',
  '/plugins/memberships/companies',
  '/plugins/memberships/plans',
] as const;

export const COMMAND_CENTER_HREF = '/plugins/sales-ops';

export function isAppsOnlyItem(href: string): boolean {
  return APPS_ONLY_ITEM_KEYS.includes(href as (typeof APPS_ONLY_ITEM_KEYS)[number]);
}

export function isMainNavOnlyItem(href: string): boolean {
  return href === COMMAND_CENTER_HREF;
}

/** Bandeja primero, Command Center segundo; el resto conserva el orden del equipo. */
export function compareMainNavigation(
  a: { href: string; order: number },
  b: { href: string; order: number },
): number {
  const priority = (href: string) => href === '/dashboard' ? 0 : href === COMMAND_CENTER_HREF ? 1 : 2;
  return priority(a.href) - priority(b.href) || a.order - b.order;
}

export type MenuOverride = { itemKey: string; pinned: boolean; order: number };
