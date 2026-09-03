'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckSquare,
  Handshake,
  Inbox,
  LayoutDashboard,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItemActive, navItemInactive } from './tokens';

export type DesktopView =
  | 'overview'
  | 'command'
  | 'leads'
  | 'deals'
  | 'accounts'
  | 'contacts'
  | 'tasks'
  | 'reports'
  | 'calendar';

const ITEMS: Array<{ view: DesktopView; href: string; icon: LucideIcon }> = [
  { view: 'overview', href: '/escritorio', icon: LayoutDashboard },
  { view: 'command', href: '/escritorio/bandeja', icon: Inbox },
  { view: 'leads', href: '/escritorio/prospectos', icon: Sparkles },
  { view: 'deals', href: '/plugins/deals', icon: Handshake },
  { view: 'accounts', href: '/escritorio/clientes', icon: Building2 },
  { view: 'contacts', href: '/escritorio/contactos', icon: Users },
  { view: 'tasks', href: '/escritorio/tareas', icon: CheckSquare },
  { view: 'reports', href: '/escritorio/informes', icon: BarChart3 },
  { view: 'calendar', href: '/escritorio/agenda', icon: CalendarDays },
];

/**
 * Navegación entre las vistas del Escritorio.
 *
 * Va como barra de píldoras dentro del contenido, no como sidebar: WhatsPro ya
 * tiene su propia navegación lateral y, en móvil, una única barra inferior
 * (`use-navigation.ts`). Un segundo sidebar competiría con esos dos y dejaría al
 * usuario sin saber cuál manda.
 */
export function DesktopNav({ labels }: { labels: Record<DesktopView, string> }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={labels.overview}
      className="custom-scrollbar -mx-1 flex snap-x items-center gap-1 overflow-x-auto rounded-full bg-muted/50 p-1"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        // El Escritorio sólo está activo en su ruta exacta; el resto admite
        // subrutas (el detalle de una oportunidad mantiene "Oportunidades").
        const isActive =
          item.href === '/escritorio'
            ? pathname.endsWith('/escritorio')
            : pathname.includes(item.href);
        return (
          <Link
            key={item.view}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex flex-none snap-start items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200',
              isActive ? navItemActive : navItemInactive,
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{labels[item.view]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
