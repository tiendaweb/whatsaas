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
  { key: '/automation', href: '/automation', icon: 'Zap', label: 'Automatización', description: 'Flujos y automatizaciones del negocio.', feature: 'isFlowBuilderEnabled', permissionKey: 'automation', order: 1 },
  { key: '/settings/ai', href: '/settings/ai', icon: 'Bot', label: 'Agente IA', description: 'Configuración del agente de inteligencia artificial.', feature: 'isAiEnabled', permissionKey: 'aiAgent', order: 2 },
  { key: '/contacts', href: '/contacts', icon: 'Users', label: 'Contactos', description: 'Directorio de contactos y clientes.', feature: null, permissionKey: 'contacts', order: 3 },
  { key: '/seguimiento', href: '/seguimiento', icon: 'Target', label: 'Seguimiento', description: 'Agenda de contactos por etapa del embudo, con chat lateral.', feature: null, permissionKey: 'contacts', order: 4 },
  { key: '/drafts', href: '/drafts', icon: 'FileText', label: 'Borradores', description: 'Mensajes guardados como borrador.', feature: null, permissionKey: 'drafts', order: 5 },
  { key: '/analytics', href: '/analytics', icon: 'PieChart', label: 'Analytics', description: 'Métricas y reportes del equipo.', feature: null, permissionKey: null, order: 6 },
  { key: '/templates', href: '/templates', icon: 'LayoutTemplate', label: 'Plantillas', description: 'Plantillas de mensajes de WhatsApp.', feature: 'isTemplatesEnabled', permissionKey: 'templates', order: 7 },
  { key: '/campaigns', href: '/campaigns', icon: 'Megaphone', label: 'Campañas', description: 'Campañas de difusión masiva.', feature: 'isCampaignsEnabled', permissionKey: 'campaigns', order: 8 },
];

// Kept in sync with components/interface/Sidebar.tsx and components/apps/launcher-catalog.ts —
// plugins whose nav items default into the Apps launcher instead of the main sidebar.
export const APPS_LAUNCHER_PREFIXES = [
  '/plugins/notes', '/plugins/calendar', '/plugins/domains',
  '/plugins/articles', '/plugins/sales', '/plugins/customers', '/plugins/memberships',
  '/plugins/aapp-space',
  '/plugins/sales-ops',
  '/plugins/tasks', '/plugins/scheduled-messages', '/plugins/mini-apps', '/plugins/form-builder',
  '/plugins/hostinger', '/plugins/meta-ads', '/plugins/documents', '/plugins/files', '/escritorio',
  '/plugins/sites',
  '/plugins/finance',
  '/plugins/purchases', '/plugins/hr', '/plugins/support', '/plugins/contracts', '/plugins/intelligence',
  '/plugins/chatgpt-connector', '/plugins/grok-connector', '/plugins/claude-code-connector',
];

export type MenuOverride = { itemKey: string; pinned: boolean; order: number };
