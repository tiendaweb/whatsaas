"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  Building,
  LogOut,
  ShieldAlert,
  CreditCard,
  Palette,
  MessageSquare,
  Wallet,
  Settings,
  LayoutTemplate,
  FileCode2,
  Puzzle,
  Store,
  Menu,
  X,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations } from "next-intl";
import { useState } from "react";

const navItems = [
  { href: "/admin", labelKey: "nav_overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", labelKey: "nav_users", icon: Users },
  { href: "/admin/teams", labelKey: "nav_teams", icon: Building },
  { href: "/admin/plans", labelKey: "nav_plans", icon: CreditCard },
  { href: "/admin/resellers", labelKey: "nav_resellers", icon: Store },
  { href: "/admin/branding", labelKey: "nav_branding", icon: Palette },
  { href: "/admin/landing", labelKey: "nav_landing", icon: LayoutTemplate },
  { href: "/admin/landing/pages", labelKey: "nav_landing_pages", icon: FileCode2 },
  { href: "/admin/chat-theme", labelKey: "nav_chat_theme", icon: MessageSquare },
  { href: "/admin/payments", labelKey: "nav_payments", icon: Wallet },
  { href: "/admin/plugins", labelKey: "nav_plugins", icon: Puzzle },
  { href: "/admin/marketplace/items", labelKey: "nav_marketplace_items", icon: Puzzle },
  { href: "/admin/marketplace/orders", labelKey: "nav_marketplace_orders", icon: Puzzle },
  { href: "/admin/settings", labelKey: "nav_settings", icon: Settings },
];

export function AdminSidebar({ ownedResellerName }: { ownedResellerName: string | null }) {
  const t = useTranslations("Admin");
  const pathname = usePathname();
  const pathnameWithoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/)/, "");
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathnameWithoutLocale === href;
    return pathnameWithoutLocale.startsWith(href);
  }

  const navigation = (
    <>
      {navItems.map(({ href, labelKey, icon: Icon, exact }) => (
        <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
          <Button
            variant={isActive(href, exact) ? "secondary" : "ghost"}
            className="w-full justify-start"
          >
            <Icon className="mr-2 h-4 w-4" />
            {t(labelKey)}
          </Button>
        </Link>
      ))}
    </>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 sm:hidden">
        <span className="font-semibold">{t("admin_panel")}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t(mobileOpen ? "close_menu" : "open_menu")}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>
      {mobileOpen ? (
        <div className="fixed inset-x-0 top-14 z-20 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b bg-background p-4 shadow-lg sm:hidden">
          <nav className="flex flex-col gap-2">{navigation}</nav>
        </div>
      ) : null}
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background sm:flex">
      <div className="flex h-16 items-center px-6 border-b">
        <ShieldAlert className="h-6 w-6 text-orange-600 mr-2" />
        <span className="font-bold">{t("admin_panel")}</span>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
        {navigation}
        <div className="mt-auto">
          {ownedResellerName ? (
            <Link href="/reseller">
              <Button variant="secondary" className="mb-2 w-full justify-start">
                <Store className="mr-2 h-4 w-4" />
                {t("open_reseller", { name: ownedResellerName })}
              </Button>
            </Link>
          ) : null}
          <Link href="/dashboard">
            <Button variant="outline" className="w-full justify-start">
              <LogOut className="mr-2 h-4 w-4" />
              {t("exit_to_app")}
            </Button>
          </Link>
        </div>
      </nav>
      <div className="flex items-center justify-between p-4 border-t">
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>
    </aside>
    </>
  );
}
