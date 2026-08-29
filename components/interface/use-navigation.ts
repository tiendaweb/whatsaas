'use client';

import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import {
  BadgeDollarSign, Blocks, Bot, Building2, CalendarDays, CheckSquare, ClipboardList, Clock, Handshake,
  CreditCard, Crown, FileSignature, FileStack, FileText, Files, Globe, Inbox, LayoutGrid, Radar,
  LayoutTemplate, LayoutDashboard as DesktopIcon, LifeBuoy, Megaphone, MessageCircle,
  NotebookText, Package, PanelsTopLeft, PieChart, Plug, Receipt, Server, ShoppingCart,
  Store, UserCheck, UserCog, Users, Zap, type LucideIcon, Target,
} from 'lucide-react';
import type { MemberPermissions } from '@/lib/permissions';

/**
 * Fuente única de la navegación del producto.
 *
 * Antes esta lógica vivía entera dentro de `Sidebar.tsx` (cuatro `useSWR`, los
 * mapas de iconos y el reparto entre menú principal y lanzador de apps), y el
 * menú móvil tenía SU PROPIA lista de nueve items escrita a mano. Resultado:
 * en el celular no aparecía ninguna aplicación instalada, porque el móvil
 * nunca leía los plugins del equipo. Ahora los dos consumen esto.
 */

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  return res.json();
};

export type NavEntry = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Degradado del icono en el lanzador de apps. */
  gradient?: string;
};

type PluginNavItem = { href: string; label: string; icon?: string; order?: number };
type MenuOverride = { itemKey: string; pinned: boolean; order: number };
type MembershipData = { role: string; permissions: MemberPermissions };

/** Nombre de icono declarado por un plugin → componente. */
export const PLUGIN_NAV_ICON_MAP: Record<string, LucideIcon> = {
  Bot, CalendarDays, NotebookText, Globe, Server, Megaphone, Package, Receipt,
  BadgeDollarSign, Building2, CreditCard, UserCheck, CheckSquare, Clock, LayoutGrid,
  Plug, ClipboardList, Store, FileStack, Files, PanelsTopLeft, ShoppingCart, UserCog,
  LifeBuoy, FileSignature, PieChart,
  // Sin estas dos entradas el manifest pide "Radar" / "Blocks", el mapa no las
  // encuentra y el ítem sale con el enchufe genérico.
  Radar, Blocks, Handshake,
};

export const NAV_PERMISSION_MAP: Record<string, keyof Omit<MemberPermissions, 'chatVisibility'>> = {
  '/automation': 'automation',
  '/dashboard?view=tasks': 'tasksRead',
  '/settings/ai': 'aiAgent',
  '/contacts': 'contacts',
  '/seguimiento': 'contacts',
  '/drafts': 'drafts',
  '/templates': 'templates',
  '/campaigns': 'campaigns',
};

/** Plugins que por defecto viven en el lanzador de apps y no en el menú principal. */
export const APPS_LAUNCHER_PREFIXES = [
  '/plugins/notes', '/plugins/calendar', '/plugins/domains',
  '/plugins/articles', '/plugins/sales', '/plugins/customers', '/plugins/memberships',
  '/plugins/aapp-space',
  '/plugins/deals',
  '/plugins/sales-ops',
  '/plugins/tasks', '/plugins/scheduled-messages', '/plugins/mini-apps', '/plugins/app-maker',
  '/plugins/form-builder',
  '/plugins/hostinger', '/plugins/meta-ads', '/plugins/documents', '/plugins/files', '/escritorio',
  '/plugins/sites',
  '/plugins/finance',
  '/plugins/purchases', '/plugins/hr', '/plugins/support', '/plugins/contracts', '/plugins/intelligence',
  '/plugins/chatgpt-connector', '/plugins/grok-connector', '/plugins/claude-code-connector',
];

export const APP_VISUAL: Record<string, { gradient: string; iconColor: string }> = {
  '/plugins/notes':               { gradient: 'from-violet-500 to-purple-600',  iconColor: 'text-white' },
  '/plugins/calendar':            { gradient: 'from-blue-500 to-cyan-500',      iconColor: 'text-white' },
  '/plugins/domains':             { gradient: 'from-emerald-500 to-teal-600',   iconColor: 'text-white' },
  '/plugins/articles':            { gradient: 'from-orange-500 to-amber-500',   iconColor: 'text-white' },
  '/plugins/sales':               { gradient: 'from-green-500 to-emerald-600',  iconColor: 'text-white' },
  '/plugins/customers':           { gradient: 'from-sky-500 to-blue-600',       iconColor: 'text-white' },
  '/plugins/memberships':         { gradient: 'from-amber-500 to-yellow-600',   iconColor: 'text-white' },
  '/plugins/memberships/subscriptions': { gradient: 'from-primary to-primary', iconColor: 'text-primary-foreground' },
  '/plugins/memberships/plans':   { gradient: 'from-primary to-primary', iconColor: 'text-primary-foreground' },
  '/plugins/memberships/companies': { gradient: 'from-primary to-primary', iconColor: 'text-primary-foreground' },
  '/plugins/aapp-space':          { gradient: 'from-emerald-600 to-cyan-600',   iconColor: 'text-white' },
  '/plugins/tasks':               { gradient: 'from-indigo-500 to-violet-600',  iconColor: 'text-white' },
  '/plugins/scheduled-messages':  { gradient: 'from-rose-500 to-pink-600',      iconColor: 'text-white' },
  '/plugins/mini-apps':           { gradient: 'from-fuchsia-500 to-pink-600',   iconColor: 'text-white' },
  // Mismo gradiente que en el lanzador (launcher-catalog.ts) para que la app se
  // vea igual en los dos lugares.
  '/plugins/app-maker':           { gradient: 'from-emerald-500 to-teal-600',   iconColor: 'text-white' },
  '/plugins/radar':               { gradient: 'from-indigo-500 to-violet-600',  iconColor: 'text-white' },
  '/plugins/deals':               { gradient: 'from-green-600 to-emerald-500',  iconColor: 'text-white' },
  '/plugins/sales-ops':           { gradient: 'from-slate-800 to-emerald-600',  iconColor: 'text-white' },
  '/plugins/form-builder':        { gradient: 'from-teal-500 to-cyan-600',      iconColor: 'text-white' },
  '/plugins/hostinger':           { gradient: 'from-purple-600 to-indigo-700',  iconColor: 'text-white' },
  '/plugins/meta-ads':            { gradient: 'from-blue-600 to-sky-500',       iconColor: 'text-white' },
  '/plugins/documents':           { gradient: 'from-stone-600 to-zinc-700',    iconColor: 'text-white' },
  '/plugins/files':               { gradient: 'from-sky-600 to-indigo-700',    iconColor: 'text-white' },
  '/plugins/sites':               { gradient: 'from-zinc-800 to-black',         iconColor: 'text-white' },
  '/plugins/finance':             { gradient: 'from-primary to-primary',         iconColor: 'text-primary-foreground' },
  '/plugins/purchases':           { gradient: 'from-amber-600 to-orange-700',   iconColor: 'text-white' },
  '/plugins/hr':                  { gradient: 'from-sky-600 to-blue-700',       iconColor: 'text-white' },
  '/plugins/support':             { gradient: 'from-rose-600 to-red-700',       iconColor: 'text-white' },
  '/plugins/contracts':           { gradient: 'from-sky-600 to-blue-700',       iconColor: 'text-white' },
  '/plugins/intelligence':        { gradient: 'from-indigo-600 to-violet-700',  iconColor: 'text-white' },
  '/escritorio':                  { gradient: 'from-slate-600 to-slate-800',    iconColor: 'text-white' },
  '/escritorio/bandeja':          { gradient: 'from-[#2f9e44] to-[#86efac]',   iconColor: 'text-white' },
};

export const APP_LABEL_OVERRIDE: Record<string, string> = {
  '/plugins/notes':              'Tareas',
  '/plugins/calendar':           'Calendario',
  '/plugins/domains':            'Dominios',
  '/plugins/articles':           'Artículos',
  '/plugins/sales':              'Ventas',
  '/plugins/customers':          'Clientes',
  '/plugins/memberships':        'Membresías',
  '/plugins/memberships/subscriptions': 'Suscripciones',
  '/plugins/memberships/plans':  'Planes',
  '/plugins/memberships/companies': 'Empresas',
  '/plugins/aapp-space':         'AAPP SPACE',
  '/plugins/tasks':              'Tareas OS',
  '/plugins/scheduled-messages': 'Programados',
  '/plugins/mini-apps':          'Mis Apps',
  '/plugins/app-maker':          'APP MAKER',
  '/plugins/radar':              'Radar',
  '/plugins/deals':              'Oportunidades',
  '/plugins/sales-ops':          'Command Center',
  '/plugins/form-builder':       'Formularios',
  '/plugins/hostinger':          'Hostinger',
  '/plugins/meta-ads':           'Meta Ads',
  '/plugins/documents':          'Documentos',
  '/plugins/files':              'Archivos',
  '/plugins/sites':              'Sitios',
  '/plugins/finance':            'Financiero',
  '/plugins/purchases':          'Compras',
  '/plugins/hr':                 'RRHH',
  '/plugins/support':            'Soporte',
  '/plugins/contracts':          'Contratos',
  '/plugins/intelligence':       'Inteligencia',
  '/escritorio':                 'Escritorio',
  '/escritorio/bandeja':         'Centro de comandos',
};

export const MINI_APP_VISUAL: Record<string, { gradient: string; iconColor: string; label: string; icon: LucideIcon }> = {
  'business-woman-planner': {
    gradient: 'from-pink-400 to-rose-500',
    iconColor: 'text-white',
    label: 'Business Woman',
    icon: Crown,
  },
};

const GRADIENTE_POR_DEFECTO = 'from-slate-500 to-slate-600';

/**
 * Menú principal y lanzador de apps ya resueltos: features del plan, permisos
 * del miembro, plugins activos, mini-apps instaladas y los overrides que el
 * equipo haya guardado desde el editor de menú.
 */
export function useNavegacion() {
  const t = useTranslations('Sidebar');

  const { data: features } = useSWR('/api/features/all', fetcher);
  const { data: membership } = useSWR<MembershipData>('/api/team/membership', fetcher);
  const { data: pluginNavItems } = useSWR<PluginNavItem[]>('/api/plugins/nav', fetcher);
  const { data: installedMiniApps } = useSWR<{ slug: string; installedAt: string }[]>('/api/mini-apps', fetcher);
  const { data: menuConfig } = useSWR<{ overrides: MenuOverride[] }>('/api/menu/config', fetcher);

  const pluginNavList = Array.isArray(pluginNavItems) ? pluginNavItems : [];
  const miniAppsList = Array.isArray(installedMiniApps) ? installedMiniApps : [];
  const overrides = new Map((menuConfig?.overrides ?? []).map((o) => [o.itemKey, o]));

  const coreDefs: Array<{ href: string; icon: LucideIcon; label: string; feature: string | null }> = [
    { href: '/dashboard', icon: MessageCircle, label: t('chats'), feature: null },
    { href: '/dashboard?view=tasks', icon: CheckSquare, label: t('tasks'), feature: null },
    { href: '/automation', icon: Zap, label: t('automation'), feature: 'isFlowBuilderEnabled' },
    { href: '/settings/ai', icon: Bot, label: t('ai_agent'), feature: 'isAiEnabled' },
    { href: '/contacts', icon: Users, label: t('contacts'), feature: null },
    { href: '/seguimiento', icon: Target, label: t('seguimiento'), feature: null },
    { href: '/drafts', icon: FileText, label: t('drafts'), feature: null },
    { href: '/analytics', icon: PieChart, label: t('dashboard'), feature: null },
    { href: '/templates', icon: LayoutTemplate, label: t('templates'), feature: 'isTemplatesEnabled' },
    { href: '/campaigns', icon: Megaphone, label: t('campaigns'), feature: 'isCampaignsEnabled' },
  ];

  const coreCandidates = coreDefs
    .filter((item) => {
      if (item.feature && features?.[item.feature] !== true) return false;
      const permKey = NAV_PERMISSION_MAP[item.href];
      if (permKey && membership?.permissions) {
        if (membership.role === 'owner') return true;
        return membership.permissions[permKey] === true;
      }
      return true;
    })
    .map((item, idx) => {
      const override = overrides.get(item.href);
      return {
        href: item.href,
        icon: item.icon,
        label: item.label,
        pinned: override?.pinned ?? true,
        order: override?.order ?? idx,
      };
    });

  const pluginCandidates = pluginNavList
    .filter((item) => !item.href.startsWith('/plugins/marketplace'))
    .map((item, idx) => {
      const override = overrides.get(item.href);
      const defaultPinned = !APPS_LAUNCHER_PREFIXES.some((prefix) => item.href.startsWith(prefix));
      return {
        href: item.href,
        icon: item.icon ? (PLUGIN_NAV_ICON_MAP[item.icon] ?? Plug) : Plug,
        label: item.label,
        pinned: override?.pinned ?? defaultPinned,
        order: override?.order ?? (100 + idx),
      };
    });

  const mainNav: NavEntry[] = [...coreCandidates, ...pluginCandidates]
    .filter((item) => item.pinned)
    .sort((a, b) => a.order - b.order)
    .map(({ href, icon, label }) => ({ href, icon, label }));

  const conVisual = (href: string, icon: LucideIcon, label: string): NavEntry => ({
    href,
    icon,
    label: APP_LABEL_OVERRIDE[href] ?? label,
    gradient: APP_VISUAL[href]?.gradient ?? GRADIENTE_POR_DEFECTO,
  });

  const apps: NavEntry[] = [
    conVisual('/escritorio', DesktopIcon, 'Escritorio'),
    // El Centro de Comandos vive dentro del Escritorio, pero es su propia
    // pantalla de trabajo: si sólo se llega pasando por otra, no se usa.
    conVisual('/escritorio/bandeja', Inbox, 'Centro de comandos'),
    ...miniAppsList
      .filter((app) => MINI_APP_VISUAL[app.slug])
      .map((app) => {
        const visual = MINI_APP_VISUAL[app.slug];
        return {
          href: `/plugins/mini-apps/${app.slug}`,
          icon: visual.icon,
          label: visual.label,
          gradient: visual.gradient,
        };
      }),
    // Los items despinneados —de plugin o del núcleo— caen todos acá: es lo
    // que el usuario ve como "sus aplicaciones".
    ...[...pluginCandidates, ...coreCandidates]
      .filter((item) => !item.pinned)
      .map((item) => conVisual(item.href, item.icon, item.label)),
  ];

  const isLoading = !features || !pluginNavItems || !menuConfig;

  return { mainNav, apps, isLoading };
}
