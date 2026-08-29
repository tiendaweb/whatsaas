'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { useEffect, useState } from 'react';
import {
  MessageCircle,
  Settings,
  Users,
  Zap,
  LayoutTemplate,
  LogOut,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Megaphone,
  FileStack,
  Files,
  Bot,
  FileText,
  Plug,
  CalendarDays,
  NotebookText,
  Globe,
  Package,
  Receipt,
  BadgeDollarSign,
  Building2,
  CreditCard,
  UserCheck,
  CheckSquare,
  Clock,
  Sparkles,
  Crown,
  LayoutGrid,
  LayoutDashboard as DesktopIcon,
  ClipboardList,
  Store,
  Grip,
  type LucideIcon,
  Server,
  ShieldAlert,
  PanelsTopLeft,
  ShoppingCart,
  UserCog,
  LifeBuoy,
  FileSignature, Target,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import useSWR, { mutate } from 'swr';
import { signOut } from '@/app/[locale]/(login)/actions';
import { User } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import { ThemeSwitcher } from '../theme-switcher';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import Logo from './Logo';
import { useTranslations } from 'next-intl';
import type { MemberPermissions } from '@/lib/permissions';
import {
  APPS_LAUNCHER_PREFIXES,
  APP_LABEL_OVERRIDE,
  APP_VISUAL,
  MINI_APP_VISUAL,
  NAV_PERMISSION_MAP,
  PLUGIN_NAV_ICON_MAP,
} from './use-navigation';

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return res.json();
};

type MembershipData = { role: string; permissions: MemberPermissions };
type SidebarUser = User & {
  ownedReseller?: { id: number; slug: string; companyName: string } | null;
};
type PluginNavItem = { href: string; label: string; icon?: string; order?: number };
type MenuOverride = { itemKey: string; pinned: boolean; order: number };

const SIDEBAR_EXPANDED_STORAGE_KEY = 'whatsaas.sidebar.expanded';

function getNavigationSection(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'plugins' || segments[0] === 'settings') {
    return `/${segments.slice(0, 2).join('/')}`;
  }
  return `/${segments[0] ?? ''}`;
}

// El catálogo de navegación (mapas de iconos, prefijos del lanzador, visuales y
// etiquetas) vive en `use-navigation.ts`: lo comparten esta barra y el menú
// móvil. Tenerlo duplicado era el motivo de que el celular mostrara nueve
// accesos fijos y ninguna aplicación del equipo.

export function Sidebar() {
  const t = useTranslations('Sidebar');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isTasksView = searchParams.get('view') === 'tasks';
  const router = useRouter();
  const { data: user }           = useSWR<SidebarUser>('/api/user', fetcher);
  const { data: features }       = useSWR('/api/features/all', fetcher);
  const { data: membership }     = useSWR<MembershipData>('/api/team/membership', fetcher);
  const { data: pluginNavItems } = useSWR<PluginNavItem[]>('/api/plugins/nav', fetcher);
  const { data: installedMiniApps = [] } = useSWR<{ slug: string; installedAt: string }[]>('/api/mini-apps', fetcher);
  const { data: menuConfig } = useSWR<{ overrides: MenuOverride[] }>('/api/menu/config', fetcher);

  const navigationSection = getNavigationSection(pathname);
  const [isExpanded, setIsExpanded] = useState(false);
  const pluginNavList = Array.isArray(pluginNavItems) ? pluginNavItems : [];
  const installedMiniAppsList = Array.isArray(installedMiniApps) ? installedMiniApps : [];
  const menuOverrideMap = new Map((menuConfig?.overrides ?? []).map(o => [o.itemKey, o]));

  useEffect(() => {
    setIsExpanded(false);
    window.localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, 'false');
  }, [navigationSection]);

  const toggleExpanded = () => {
    setIsExpanded((currentValue) => {
      const nextValue = !currentValue;
      window.localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, String(nextValue));
      return nextValue;
    });
  };

  const allNavItems = [
    { href: '/dashboard',  icon: MessageCircle,   label: t('chats'),      feature: null },
    { href: '/dashboard?view=tasks', icon: CheckSquare, label: t('tasks'), feature: null },
    { href: '/automation', icon: Zap,             label: t('automation'), feature: 'isFlowBuilderEnabled' },
    { href: '/settings/ai',icon: Bot,             label: t('ai_agent'),   feature: 'isAiEnabled' },
    { href: '/contacts',   icon: Users,           label: t('contacts'),   feature: null },
    { href: '/seguimiento', icon: Target,         label: t('seguimiento'), feature: null },
    { href: '/drafts',     icon: FileText,        label: t('drafts'),     feature: null },
    { href: '/analytics',  icon: PieChart,        label: t('dashboard'),  feature: null },
    { href: '/templates',  icon: LayoutTemplate,  label: t('templates'),  feature: 'isTemplatesEnabled' },
    { href: '/campaigns',  icon: Megaphone,       label: t('campaigns'),  feature: 'isCampaignsEnabled' },
  ];

  const navItemsBase = allNavItems.filter(item => {
    if (item.feature && features?.[item.feature] !== true) return false;
    const permKey = NAV_PERMISSION_MAP[item.href];
    if (permKey && membership?.permissions) {
      if (membership.role === 'owner') return true;
      return membership.permissions[permKey] === true;
    }
    return true;
  });

  // Core items are pinned to the main nav by default; a menu override can unpin them into the launcher.
  const coreCandidates = navItemsBase.map((item, idx) => {
    const override = menuOverrideMap.get(item.href);
    return {
      href: item.href,
      icon: item.icon,
      label: item.label,
      pinned: override?.pinned ?? true,
      order: override?.order ?? idx,
    };
  });

  // Dynamic plugin items — apps-launcher items (incl. marketplace) default to the launcher; a menu override can pin/unpin them.
  const pluginCandidates = pluginNavList
    .filter(item => !item.href.startsWith('/plugins/marketplace'))
    .map((item, idx) => {
      const override = menuOverrideMap.get(item.href);
      const defaultPinned = !APPS_LAUNCHER_PREFIXES.some(p => item.href.startsWith(p));
      return {
        href: item.href,
        icon: item.icon ? (PLUGIN_NAV_ICON_MAP[item.icon] ?? Plug) : Plug,
        label: item.label,
        pinned: override?.pinned ?? defaultPinned,
        order: override?.order ?? (100 + idx),
      };
    });

  const dynamicPluginNavItems = [...coreCandidates, ...pluginCandidates]
    .filter(item => item.pinned)
    .sort((a, b) => a.order - b.order);

  // Apps for the launcher panel: default-launcher plugin items plus any core item unpinned via the menu editor.
  const launcherApps = pluginCandidates
    .filter(item => !item.pinned)
    .map(item => ({
      href: item.href,
      icon: item.icon,
      label: APP_LABEL_OVERRIDE[item.href] ?? item.label,
      visual: APP_VISUAL[item.href] ?? { gradient: 'from-slate-500 to-slate-600', iconColor: 'text-white' },
    }));

  const demotedCoreApps = coreCandidates
    .filter(item => !item.pinned)
    .map(item => ({
      href: item.href,
      icon: item.icon,
      label: item.label,
      visual: APP_VISUAL[item.href] ?? { gradient: 'from-slate-500 to-slate-600', iconColor: 'text-white' },
    }));

  const staticApps = [
    {
      href: '/escritorio',
      icon: DesktopIcon,
      label: 'Escritorio',
      visual: APP_VISUAL['/escritorio'] ?? { gradient: 'from-slate-600 to-slate-800', iconColor: 'text-white' },
    },
  ];

  // Installed mini-apps as individual launcher entries
  const miniAppLauncherEntries = installedMiniAppsList
    .filter(a => MINI_APP_VISUAL[a.slug])
    .map(a => {
      const v = MINI_APP_VISUAL[a.slug];
      return {
        href: `/plugins/mini-apps/${a.slug}`,
        icon: v.icon,
        label: v.label,
        visual: { gradient: v.gradient, iconColor: v.iconColor },
      };
    });

  const mergedNavItems = dynamicPluginNavItems;
  const allLauncherApps = [...staticApps, ...miniAppLauncherEntries, ...launcherApps, ...demotedCoreApps];

  const isAppsActive =
    pathname.startsWith('/apps') ||
    pathname.startsWith('/plugins/marketplace') ||
    allLauncherApps.some(a => pathname.startsWith(a.href));

  async function handleSignOut() {
    await signOut();
    mutate('/api/user');
    router.push('/');
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-background border-r border-border transition-all duration-300 ease-in-out z-50',
        isExpanded ? 'w-[200px]' : 'w-[54px]',
      )}
    >
      {/* Logo */}
      <div className="relative flex h-12 items-center justify-center border-b border-border">
        <div className="flex items-center overflow-hidden">
          <Logo showName={isExpanded} compact />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-[9px] top-[15px] z-50 hidden size-[18px] rounded-full border border-border bg-background shadow-sm hover:bg-muted md:flex"
          onClick={toggleExpanded}
          aria-label={isExpanded ? 'Contraer navegación' : 'Expandir navegación'}
        >
          {isExpanded ? <ChevronLeft className="size-2" /> : <ChevronRight className="size-2" />}
        </Button>
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {mergedNavItems.map(item => {
          const isActive = item.href === '/dashboard?view=tasks'
            ? pathname === '/dashboard' && isTasksView
            : item.href === '/dashboard'
              ? pathname === '/dashboard' && !isTasksView
              : pathname === item.href ||
                (item.href !== '/analytics' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 transition-colors md:min-h-8',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                !isExpanded && 'justify-center px-0',
              )}
              title={!isExpanded ? item.label : undefined}
            >
              <item.icon
                className={cn(
                  'size-4 shrink-0',
                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              {isExpanded && (
                <span className="font-medium text-sm whitespace-nowrap overflow-hidden animate-in fade-in duration-200">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}

        {/* APPS launcher button */}
        {allLauncherApps.length > 0 && (
          <Link
            href="/apps"
            title={!isExpanded ? 'APPS' : undefined}
            className={cn(
              'group flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors md:min-h-8',
              isAppsActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              !isExpanded && 'justify-center px-0',
            )}
          >
            <Grip
              className={cn(
                'size-4 shrink-0',
                isAppsActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
            {isExpanded && (
              <span className="font-medium text-sm whitespace-nowrap animate-in fade-in duration-200">
                APPS
              </span>
            )}
          </Link>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-border p-1.5">
        <div className={cn('flex items-center', isExpanded ? 'justify-between' : 'justify-center')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-2 rounded-md p-1.5 outline-none transition-all hover:bg-muted',
                  !isExpanded && 'justify-center',
                )}
              >
                <Avatar className="size-7 border border-border">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {user?.name?.substring(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {isExpanded && (
                  <div className="flex flex-col items-start text-left overflow-hidden animate-in fade-in duration-200">
                    <span className="text-sm font-medium text-foreground truncate w-full">{user?.name || 'User'}</span>
                    <span className="text-xs text-muted-foreground truncate w-full">{user?.email}</span>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side={isExpanded ? 'top' : 'right'} className="w-56" sideOffset={8}>
              {user?.role === 'admin' && (
                <DropdownMenuItem className="cursor-pointer" asChild>
                  <Link href="/admin/resellers">
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    <span>{t('admin_resellers')}</span>
                  </Link>
                </DropdownMenuItem>
              )}
              {user?.ownedReseller && (
                <DropdownMenuItem className="cursor-pointer" asChild>
                  <Link href="/reseller">
                    <Store className="mr-2 h-4 w-4" />
                    <span>{t('reseller_panel')}</span>
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href={membership?.role === 'owner' || membership?.permissions?.settings ? '/settings' : '/settings/general'}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>{t('settings')}</span>
                </Link>
              </DropdownMenuItem>
              <form action={handleSignOut} className="w-full">
                <button type="submit" className="w-full">
                  <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer w-full">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t('sign_out')}</span>
                  </DropdownMenuItem>
                </button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Language + Theme */}
      <div className={cn('flex items-center gap-2 p-1.5', isExpanded ? 'justify-between' : 'justify-center')}>
        {isExpanded && (
          <div className="animate-in fade-in duration-200">
            <LanguageSwitcher />
          </div>
        )}
        <ThemeSwitcher compact />
      </div>

    </aside>
  );
}
