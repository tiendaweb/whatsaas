'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Users,
  Building,
  LogOut,
  ShieldAlert,
  CreditCard,
  Palette,
  MessageSquare,
} from 'lucide-react';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const navItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/teams', label: 'Teams', icon: Building },
  { href: '/admin/plans', label: 'Plans', icon: CreditCard },
  { href: '/admin/branding', label: 'Branding', icon: Palette },
  { href: '/admin/chat-theme', label: 'Chat Theme', icon: MessageSquare },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const pathnameWithoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/)/, '');

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathnameWithoutLocale === href;
    return pathnameWithoutLocale.startsWith(href);
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background sm:flex">
      <div className="flex h-16 items-center px-6 border-b">
        <ShieldAlert className="h-6 w-6 text-orange-600 mr-2" />
        <span className="font-bold">Admin Panel</span>
      </div>
      <nav className="flex flex-1 flex-col gap-2 p-4">
        {navItems.map(({ href, label, icon: Icon, exact }) => (
          <Link key={href} href={href}>
            <Button
              variant={isActive(href, exact) ? 'secondary' : 'ghost'}
              className="w-full justify-start"
            >
              <Icon className="mr-2 h-4 w-4" />
              {label}
            </Button>
          </Link>
        ))}
        <div className="mt-auto">
          <Link href="/dashboard">
            <Button variant="outline" className="w-full justify-start">
              <LogOut className="mr-2 h-4 w-4" />
              Exit to App
            </Button>
          </Link>
        </div>
      </nav>
      <div className="flex items-center justify-between p-4 border-t">
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>
    </aside>
  );
}
