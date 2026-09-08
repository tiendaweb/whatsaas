import {
  BadgeDollarSign,
  Bot,
  Blocks,
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Clock,
  Crown,
  CreditCard,
  FileText,
  Files,
  FileStack,
  Globe,
  Inbox,
  Handshake,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  MessageCircle,
  Megaphone,
  NotebookText,
  Package,
  PanelsTopLeft,
  PieChart,
  Plug,
  Radar,
  Receipt,
  Server,
  ShoppingCart,
  Sparkles,
  Store,
  UserCheck,
  UserCog,
  Users,
  Wand2,
  LifeBuoy,
  FileSignature,
  Zap,
  type LucideIcon, Target,
} from 'lucide-react';
import {
  APPS_LAUNCHER_PREFIXES,
  CORE_NAV_ITEMS,
  isAppsOnlyItem,
  isMainNavOnlyItem,
  type MenuOverride,
} from '@/lib/menu/core-nav-items';

export type PluginNavItem = { href: string; label: string; icon?: string; order?: number };
export type InstalledMiniApp = { slug: string; installedAt: string };
export type PublishedAppMakerApp = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  accent: string;
  status: 'published';
  version: number;
  publishedVersion: number | null;
  updatedAt: string;
};
export type LauncherApp = {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  visual: { gradient: string; iconColor: string; imageUrl?: string; imageAlt?: string; invertInDark?: boolean };
};

const AAPP_SPACE_LOGO = '/integrations/brands/aapp-space.svg';

const PLUGIN_NAV_ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  BadgeDollarSign,
  Building2,
  CalendarDays,
  NotebookText,
  Globe,
  Package,
  Receipt,
  UserCheck,
  CheckSquare,
  Clock,
  LayoutGrid,
  Plug,
  ClipboardList,
  CreditCard,
  Store,
  Server,
  Megaphone,
  FileStack,
  Files,
  PanelsTopLeft,
  ShoppingCart,
  UserCog,
  LifeBuoy,
  FileSignature,
  PieChart,
  MessageCircle,
  Zap,
  Users,
  FileText,
  Target,
  LayoutTemplate,
  Blocks,
  Radar,
  Handshake,
  Sparkles,
  Wand2,
};

const APP_VISUAL: Record<string, LauncherApp['visual']> = {
  '/dashboard?view=tasks': { gradient: 'from-slate-600 to-slate-800', iconColor: 'text-white' },
  '/plugins/notes': { gradient: 'from-violet-500 to-purple-600', iconColor: 'text-white' },
  '/plugins/calendar': { gradient: 'from-blue-500 to-cyan-500', iconColor: 'text-white' },
  '/plugins/domains': { gradient: 'from-emerald-500 to-teal-600', iconColor: 'text-white' },
  '/plugins/articles': { gradient: 'from-orange-500 to-amber-500', iconColor: 'text-white' },
  '/plugins/sales': { gradient: 'from-green-500 to-emerald-600', iconColor: 'text-white' },
  '/plugins/customers': { gradient: 'from-sky-500 to-blue-600', iconColor: 'text-white' },
  '/plugins/memberships': { gradient: 'from-amber-500 to-yellow-600', iconColor: 'text-white' },
  '/plugins/memberships/subscriptions': { gradient: 'from-primary to-primary', iconColor: 'text-primary-foreground' },
  '/plugins/memberships/plans': { gradient: 'from-primary to-primary', iconColor: 'text-primary-foreground' },
  '/plugins/memberships/companies': { gradient: 'from-primary to-primary', iconColor: 'text-primary-foreground' },
  '/plugins/aapp-space': {
    gradient: 'from-white to-white',
    iconColor: 'text-slate-950',
    imageUrl: AAPP_SPACE_LOGO,
    imageAlt: 'AAPP SPACE',
  },
  '/plugins/tasks': { gradient: 'from-indigo-500 to-violet-600', iconColor: 'text-white' },
  '/plugins/scheduled-messages': { gradient: 'from-rose-500 to-pink-600', iconColor: 'text-white' },
  '/plugins/mini-apps': { gradient: 'from-fuchsia-500 to-pink-600', iconColor: 'text-white' },
  '/plugins/app-maker': { gradient: 'from-emerald-500 to-teal-600', iconColor: 'text-white' },
  '/plugins/form-builder': { gradient: 'from-teal-500 to-cyan-600', iconColor: 'text-white' },
  '/plugins/hostinger': { gradient: 'from-purple-600 to-indigo-700', iconColor: 'text-white' },
  '/plugins/meta-ads': { gradient: 'from-blue-600 to-sky-500', iconColor: 'text-white' },
  '/plugins/documents': { gradient: 'from-stone-600 to-zinc-700', iconColor: 'text-white' },
  '/plugins/files': { gradient: 'from-sky-600 to-indigo-700', iconColor: 'text-white' },
  '/plugins/sites': { gradient: 'from-blue-600 to-indigo-700', iconColor: 'text-white' },
  '/plugins/finance': { gradient: 'from-primary to-primary', iconColor: 'text-primary-foreground' },
  '/plugins/purchases': { gradient: 'from-amber-600 to-orange-700', iconColor: 'text-white' },
  '/plugins/hr': { gradient: 'from-sky-600 to-blue-700', iconColor: 'text-white' },
  '/plugins/support': { gradient: 'from-rose-600 to-red-700', iconColor: 'text-white' },
  '/plugins/contracts': { gradient: 'from-sky-600 to-blue-700', iconColor: 'text-white' },
  '/plugins/intelligence': { gradient: 'from-indigo-600 to-violet-700', iconColor: 'text-white' },
  '/plugins/gemini': { gradient: 'from-blue-500 to-violet-600', iconColor: 'text-white' },
  '/plugins/radar': { gradient: 'from-indigo-500 to-violet-600', iconColor: 'text-white' },
  '/plugins/deals': { gradient: 'from-green-600 to-emerald-500', iconColor: 'text-white' },
  '/plugins/sales-ops': { gradient: 'from-slate-800 to-emerald-600', iconColor: 'text-white' },
  // El rosa de la cabina del Studio, igual adentro que en el lanzador.
  '/plugins/sales-ops/studio': { gradient: 'from-[#f43f8e] to-[#ff2e4d]', iconColor: 'text-white' },
  '/plugins/grok-connector': {
    gradient: 'from-white to-white',
    iconColor: 'text-slate-950',
    imageUrl: '/integrations/brands/grok.svg',
    imageAlt: 'Grok',
    invertInDark: true,
  },
  '/plugins/claude-code-connector': {
    gradient: 'from-white to-white',
    iconColor: 'text-slate-950',
    imageUrl: '/integrations/brands/claude.svg',
    imageAlt: 'Claude',
  },
  '/plugins/chatgpt-connector': {
    gradient: 'from-white to-white',
    iconColor: 'text-slate-950',
    imageUrl: '/integrations/brands/openai.svg',
    imageAlt: 'OpenAI',
    invertInDark: true,
  },
  '/escritorio': { gradient: 'from-slate-600 to-slate-800', iconColor: 'text-white' },
  '/seguimiento': { gradient: 'from-emerald-500 to-teal-600', iconColor: 'text-white' },
  '/escritorio/bandeja': { gradient: 'from-[#2f9e44] to-[#86efac]', iconColor: 'text-white' },
};

const APP_LABEL_OVERRIDE: Record<string, string> = {
  '/dashboard?view=tasks': 'Tareas',
  '/plugins/notes': 'Tareas',
  '/plugins/calendar': 'Calendario',
  '/plugins/domains': 'Dominios',
  '/plugins/articles': 'Articulos',
  '/plugins/sales': 'Ventas',
  '/plugins/customers': 'Clientes',
  '/plugins/memberships': 'Membresías',
  '/plugins/memberships/subscriptions': 'Suscripciones',
  '/plugins/memberships/plans': 'Planes',
  '/plugins/memberships/companies': 'Empresas',
  '/plugins/aapp-space': 'AAPP SPACE',
  '/plugins/tasks': 'Tareas OS',
  '/plugins/scheduled-messages': 'Programados',
  '/plugins/mini-apps': 'Mis Apps',
  '/plugins/app-maker': 'APP MAKER',
  '/plugins/form-builder': 'Formularios',
  '/plugins/hostinger': 'Hostinger',
  '/plugins/meta-ads': 'Meta Ads',
  '/plugins/documents': 'Documentos',
  '/plugins/files': 'Archivos',
  '/plugins/sites': 'Sitios',
  '/plugins/sales-ops/studio': 'Prompt Studio',
  '/plugins/finance': 'Financiero',
  '/plugins/purchases': 'Compras',
  '/plugins/hr': 'RRHH',
  '/plugins/support': 'Soporte',
  '/plugins/contracts': 'Contratos',
  '/plugins/intelligence': 'Inteligencia',
  '/plugins/gemini': 'Gemini',
  '/plugins/grok-connector': 'Grok',
  '/plugins/claude-code-connector': 'Claude Code',
  '/plugins/chatgpt-connector': 'ChatGPT',
  '/escritorio': 'Escritorio',
  '/seguimiento': 'Seguimiento',
  '/escritorio/bandeja': 'Centro de comandos',
};

const APP_DESCRIPTION: Record<string, string> = {
  '/dashboard?view=tasks': 'Vista clásica de tareas vinculadas a la bandeja.',
  '/plugins/notes': 'Notas, tareas rapidas y seguimiento diario.',
  '/plugins/calendar': 'Vista de calendario para organizar trabajo y entregas.',
  '/plugins/domains': 'Gestion de dominios y activos web.',
  '/plugins/articles': 'Contenido, articulos y publicaciones internas.',
  '/plugins/sales': 'Pipeline comercial, oportunidades y ventas.',
  '/plugins/customers': 'Clientes, seguimiento y relacion comercial.',
  '/plugins/memberships': 'Planes de membresía, suscripciones y vencimientos.',
  '/plugins/memberships/subscriptions': 'Altas, estados, pagos y vencimientos de suscripciones.',
  '/plugins/memberships/plans': 'Catálogo de planes, precios y características.',
  '/plugins/memberships/companies': 'Empresas, información comercial y oferta asociada.',
  '/plugins/aapp-space': 'Sincronización de clientes, tiendas y pagos de GoBiz.',
  '/plugins/tasks': 'Sistema completo de tareas, tableros y proyectos.',
  '/plugins/scheduled-messages': 'Mensajes programados para WhatsApp.',
  '/plugins/mini-apps': 'Coleccion de mini aplicaciones instalables.',
  '/plugins/app-maker': 'Constructor declarativo de aplicaciones internas conectadas a WhatsPro.',
  '/plugins/form-builder': 'Formularios para capturar datos y solicitudes.',
  '/plugins/hostinger': 'Conecta cuentas de Hostinger e importa dominios.',
  '/plugins/meta-ads': 'Campañas publicitarias de Meta: resultados, historial y reportes en PDF.',
  '/plugins/documents': 'Documentos y notas del equipo, con carpetas y enlaces entre notas.',
  '/plugins/files': 'Archivos y documentos compartidos en todos los chats, organizados en una sola vista.',
  '/plugins/sites': 'Creá, editá y publicá sitios web desde un solo lugar.',
  '/plugins/finance': 'Ingresos, egresos, recurrencias y comprobantes vinculados a tus clientes.',
  '/plugins/purchases': 'Proveedores y órdenes de compra.',
  '/plugins/hr': 'Directorio del equipo y comisiones sobre ventas.',
  '/plugins/support': 'Tickets de soporte y postventa por cliente.',
  '/plugins/contracts': 'Contratos comerciales por cliente, vencimientos y renovación.',
  '/plugins/intelligence': 'Panel de dirección: finanzas, ventas, compras, soporte y contratos en un vistazo.',
  '/plugins/gemini': 'Claves y capacidad de Gemini disponibles para las funciones de IA del equipo.',
  '/plugins/radar': 'Inteligencia comercial viva: clientes analizados, informes y widgets que generan las IA.',
  '/plugins/grok-connector': 'Conector MCP de solo lectura para consultar WhatsPro desde Grok.',
  '/plugins/claude-code-connector': 'Conector MCP de solo lectura para trabajar con WhatsPro desde Claude Code.',
  '/plugins/chatgpt-connector': 'Conector MCP de solo lectura para consultar WhatsPro desde ChatGPT.',
  '/escritorio': 'Acceso rapido al escritorio operativo.',
  '/seguimiento': 'Agenda de contactos por etapa del embudo, con filtros por etiqueta y segmento.',
  '/escritorio/bandeja': 'Todo lo que hay que atender, con la respuesta ya redactada por la IA.',
};

const MINI_APP_VISUAL: Record<string, { gradient: string; iconColor: string; label: string; icon: LucideIcon; description: string }> = {
  'business-woman-planner': {
    gradient: 'from-pink-400 to-rose-500',
    iconColor: 'text-white',
    label: 'Business Woman',
    icon: Crown,
    description: 'Planner ejecutivo con clientes, ventas, agenda y crecimiento.',
  },
};

export function buildLauncherApps(
  pluginNavItems: PluginNavItem[] = [],
  installedMiniApps: InstalledMiniApp[] = [],
  menuOverrides: MenuOverride[] = [],
  publishedAppMakerApps: PublishedAppMakerApp[] = [],
) {
  const overrideMap = new Map(menuOverrides.map((o) => [o.itemKey, o.pinned]));

  const staticApps: LauncherApp[] = [
    {
      href: '/escritorio',
      icon: LayoutDashboard,
      label: 'Escritorio',
      description: APP_DESCRIPTION['/escritorio'],
      visual: APP_VISUAL['/escritorio'],
    },
    {
      href: '/escritorio/bandeja',
      icon: Inbox,
      label: 'Centro de comandos',
      description: APP_DESCRIPTION['/escritorio/bandeja'],
      visual: APP_VISUAL['/escritorio/bandeja'],
    },
    {
      href: '/seguimiento',
      icon: Target,
      label: 'Seguimiento',
      description: APP_DESCRIPTION['/seguimiento'],
      visual: APP_VISUAL['/seguimiento'],
    },
  ];

  const miniApps = installedMiniApps
    .filter((app) => MINI_APP_VISUAL[app.slug])
    .map((app) => {
      const visual = MINI_APP_VISUAL[app.slug];
      return {
        href: `/plugins/mini-apps/${app.slug}`,
        icon: visual.icon,
        label: visual.label,
        description: visual.description,
        visual: { gradient: visual.gradient, iconColor: visual.iconColor },
      };
    });

  const appMakerApps: LauncherApp[] = publishedAppMakerApps.map((app) => ({
    href: `/plugins/app-maker/run/${app.slug}`,
    icon: PLUGIN_NAV_ICON_MAP[app.icon] ?? Blocks,
    label: app.name,
    description: app.description || `Aplicación ${app.category} creada con APP MAKER.`,
    visual: {
      gradient: app.accent === 'blue' ? 'from-blue-500 to-cyan-600'
        : app.accent === 'violet' ? 'from-violet-500 to-purple-600'
          : app.accent === 'rose' ? 'from-rose-500 to-pink-600'
            : app.accent === 'amber' ? 'from-amber-500 to-orange-600'
              : app.accent === 'slate' ? 'from-slate-600 to-slate-800'
                : 'from-emerald-500 to-teal-600',
      iconColor: 'text-white',
    },
  }));

  const pluginApps = pluginNavItems
    .filter((item) => !item.href.startsWith('/plugins/marketplace'))
    .filter((item) => item.href !== '/escritorio')
    .filter((item) => !isMainNavOnlyItem(item.href))
    .filter((item) => {
      if (isAppsOnlyItem(item.href)) return true;
      const override = overrideMap.get(item.href);
      if (override !== undefined) return override === false;
      return item.href.startsWith('/plugins/') || APPS_LAUNCHER_PREFIXES.some((prefix) => item.href.startsWith(prefix));
    })
    .map((item) => ({
      href: item.href,
      icon: item.icon ? (PLUGIN_NAV_ICON_MAP[item.icon] ?? Plug) : Plug,
      label: APP_LABEL_OVERRIDE[item.href] ?? item.label,
      description: APP_DESCRIPTION[item.href] ?? 'Aplicación disponible para tu equipo.',
      visual: APP_VISUAL[item.href] ?? { gradient: 'from-slate-500 to-slate-600', iconColor: 'text-white' },
    }));

  // Core menu items (Chats, Contactos, etc.) only show here once removed from the main nav via the menu editor.
  const coreApps = CORE_NAV_ITEMS
    .filter((item) => isAppsOnlyItem(item.href) || overrideMap.get(item.key) === false)
    .map((item) => ({
      href: item.href,
      icon: PLUGIN_NAV_ICON_MAP[item.icon] ?? Plug,
      label: item.label,
      description: item.description,
      visual: APP_VISUAL[item.href] ?? { gradient: 'from-slate-500 to-slate-600', iconColor: 'text-white' },
    }));

  const byHref = new Map<string, LauncherApp>();
  [...staticApps, ...miniApps, ...appMakerApps, ...pluginApps, ...coreApps].forEach((app) => byHref.set(app.href, app));
  return Array.from(byHref.values());
}
