'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Users,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Settings,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Logo from './Logo';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Inbox', icon: MessageSquare, exact: true },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Zap },
  { href: '/templates', label: 'Templates', icon: Bot },
  { href: '/automation', label: 'Automation', icon: LayoutDashboard },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const pathnameWithoutLocale = useMemo(
    () => pathname.replace(/^\/[a-z]{2}(?=\/)/, ''),
    [pathname]
  );

  const isActive = (item: NavItem) => {
    if (item.exact) return pathnameWithoutLocale === item.href;
    return pathnameWithoutLocale.startsWith(item.href);
  };

  const NavContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center border-b px-4 py-4', collapsed && !mobile ? 'justify-center' : 'justify-between')}>
        <Link href="/" className="min-w-0" onClick={() => setMobileOpen(false)}>
          <Logo showName={!collapsed || mobile} />
        </Link>
        {!mobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);

          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
              <div
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  collapsed && !mobile ? 'justify-center px-2' : undefined
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {collapsed && !mobile ? null : <span>{item.label}</span>}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      <div className="fixed left-4 top-4 z-40 md:hidden">
        <Button type="button" size="icon" variant="outline" className="bg-background shadow-sm" onClick={() => setMobileOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex border-r bg-background transition-transform md:static md:translate-x-0',
          collapsed ? 'w-[88px]' : 'w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="hidden h-full md:flex"><NavContent /></div>
        <div className="flex h-full w-72 md:hidden"><NavContent mobile /></div>
      </aside>
    </>
  );
}
