'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import { Link } from '@/i18n/routing';
import { useState } from 'react';
import { 
  MessageCircle, 
  Settings, 
  Users, 
  Zap, 
  LayoutTemplate, 
  LogOut, 
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Bot,
  LayoutDashboard,
  FileText,
  Plug,
  Rocket,
  CalendarDays,
  NotebookText,
  type LucideIcon,
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

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type MembershipData = { role: string; permissions: MemberPermissions };
type PluginNavItem = { href: string; label: string; icon?: string; order?: number };

const PLUGIN_NAV_ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  CalendarDays,
  NotebookText,
  Plug,
  Rocket,
};

const NAV_PERMISSION_MAP: Record<string, keyof Omit<MemberPermissions, 'chatVisibility'>> = {
  '/automation': 'automation',
  '/settings/ai': 'aiAgent',
  '/contacts': 'contacts',
  '/drafts': 'drafts',
  '/templates': 'templates',
  '/campaigns': 'campaigns',
};

export function Sidebar() {
  const t = useTranslations('Sidebar');
  const pathname = usePathname();
  const router = useRouter();
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const { data: features } = useSWR('/api/features/all', fetcher);
  const { data: membership } = useSWR<MembershipData>('/api/team/membership', fetcher);
  const { data: pluginNavItems } = useSWR<PluginNavItem[]>('/api/plugins/nav', fetcher);
  const [isExpanded, setIsExpanded] = useState(false);

  const allNavItems = [
    { href: '/dashboard', icon: MessageCircle, label: t('chats'), feature: null },
    { href: '/automation', icon: Zap, label: t('automation'), feature: 'isFlowBuilderEnabled' },
    { href: '/settings/ai', icon: Bot, label: t('ai_agent'), feature: 'isAiEnabled' },
    { href: '/contacts', icon: Users, label: t('contacts'), feature: null },
    { href: '/drafts', icon: FileText, label: t('drafts'), feature: null },
    { href: '/analytics', icon: LayoutDashboard, label: t('dashboard'), feature: null },
    { href: '/templates', icon: LayoutTemplate, label: t('templates'), feature: 'isTemplatesEnabled' },
    { href: '/campaigns', icon: Megaphone, label: t('campaigns'), feature: 'isCampaignsEnabled' },
  ];

  const navItems = allNavItems.filter(item => {
    if (item.feature && features?.[item.feature] !== true) return false;
    const permKey = NAV_PERMISSION_MAP[item.href];
    if (permKey && membership?.permissions) {
      if (membership.role === 'owner') return true;
      return membership.permissions[permKey] === true;
    }
    return true;
  });

  const dynamicPluginNavItems =
    pluginNavItems?.map((item) => ({
      href: item.href,
      icon: item.icon ? (PLUGIN_NAV_ICON_MAP[item.icon] ?? Plug) : Plug,
      label: item.label,
      feature: null,
    })) ?? [];

  const mergedNavItems = [...navItems, ...dynamicPluginNavItems];

  async function handleSignOut() {
    await signOut();
    mutate('/api/user');
    router.push('/');
  }

  const toggleSidebar = () => setIsExpanded(!isExpanded);

  return (
    <aside 
      className={cn(
        "flex flex-col h-screen bg-background border-r border-border transition-all duration-300 ease-in-out z-50",
        isExpanded ? "w-64" : "w-[70px]"
      )}
    >
      <div className="h-[60px] flex items-center justify-center border-b border-border relative">
        <div className="flex items-center gap-2 overflow-hidden">
            <Logo showName={isExpanded} />
        </div>
        
        <Button
            variant="ghost"
            size="icon"
            className="absolute -right-3 top-4 h-6 w-6 rounded-full border border-border bg-background shadow-sm hover:bg-muted z-50 hidden md:flex"
            onClick={toggleSidebar}
        >
             {isExpanded ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </Button>
      </div>

      <nav className="flex-1 flex flex-col gap-2 p-3">
        {mergedNavItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && item.href !== '/analytics' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors group",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                !isExpanded && "justify-center px-0"
              )}
              title={!isExpanded ? item.label : undefined}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              {isExpanded && (
                  <span className="font-medium text-sm whitespace-nowrap overflow-hidden animate-in fade-in duration-200">
                      {item.label}
                  </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <div className={cn("flex items-center", isExpanded ? "justify-between" : "justify-center")}>
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className={cn(
                    "flex items-center gap-3 rounded-lg p-2 hover:bg-muted transition-all outline-none",
                    !isExpanded && "justify-center"
                )}>
                <Avatar className="h-9 w-9 border border-border">
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
            <DropdownMenuContent align="start" side={isExpanded ? "top" : "right"} className="w-56" sideOffset={8}>
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
      <div className={cn(
          "flex items-center p-3 gap-2",
          isExpanded ? "justify-between" : "justify-center"
      )}>
          {isExpanded && (
            <div className="animate-in fade-in duration-200">
              <LanguageSwitcher />
            </div>
          )}
          <ThemeSwitcher />
      </div>
    </aside>
  );
}
