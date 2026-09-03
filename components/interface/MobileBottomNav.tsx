'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, ListChecks, Menu, MessageCircle, Plus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { MobileMenuSheet } from './MobileMenuSheet';
import { useNavegacion } from './use-navigation';

/**
 * Barra inferior del móvil. Es la MISMA en todas las pantallas del panel:
 * cuatro accesos y, siempre en el mismo lugar, el botón de menú.
 *
 * Los cuatro accesos de la izquierda son estables. Las vistas internas de la
 * bandeja tienen su propio selector responsive dentro de /dashboard.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const t = useTranslations('Sidebar');
  const { mainNav } = useNavegacion();

  const pathWithoutLocale = pathname.replace(/^\/(pt|en|es)(?=\/|$)/, '') || '/';

  const enPanel = [
    '/dashboard', '/contacts', '/seguimiento', '/settings', '/automation', '/drafts',
    '/analytics', '/templates', '/campaigns', '/apps', '/escritorio', '/plugins/',
  ].some((prefix) => pathWithoutLocale.startsWith(prefix));

  // Dentro de una conversación manda el chat: la barra taparía el teclado.
  const enChat = pathWithoutLocale.startsWith('/dashboard/chat/');
  if (!enPanel || enChat) return null;

  const esRutaActiva = (href: string) =>
    href === '/dashboard' ? pathWithoutLocale === '/dashboard' : pathWithoutLocale.startsWith(href);

  type Slot = { key: string; label: string; icon: typeof MessageCircle; activo: boolean; onClick: () => void };

  const commandCenter = mainNav.find((item) => item.href === '/plugins/sales-ops');
  const secondary = commandCenter
    ? [commandCenter.href, commandCenter.label, commandCenter.icon] as const
    : ['/contacts', t('contacts'), Users] as const;

  const slots: Slot[] = ([
    ['/dashboard', t('chats'), MessageCircle],
    secondary,
    ['/plugins/tasks', 'Tareas OS', ListChecks],
    ['/apps', 'Apps', LayoutGrid],
  ] as const).map(([href, label, icon]) => ({
    key: href,
    label,
    icon,
    activo: esRutaActiva(href),
    onClick: () => router.push(href),
  }));

  return (
    <>
      {pathWithoutLocale === '/dashboard' && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('dashboard:open-new-chat'))}
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
          aria-label="Nuevo chat"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(4.25rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label="Navegación principal"
      >
        {slots.map((slot) => (
          <button
            key={slot.key}
            type="button"
            onClick={slot.onClick}
            className={cn(
              'relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
              slot.activo ? 'text-primary' : 'text-muted-foreground active:bg-muted',
            )}
            aria-current={slot.activo ? 'page' : undefined}
          >
            <span className={cn('absolute top-0 h-0.5 w-10 bg-transparent transition-colors', slot.activo && 'bg-primary')} />
            <slot.icon className={cn('h-5 w-5', slot.activo && 'stroke-[2.5]')} />
            <span className="truncate px-0.5">{slot.label}</span>
          </button>
        ))}

        {/* Siempre el quinto, siempre igual: es el ancla del menú. */}
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          className={cn(
            'relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
            menuAbierto ? 'text-primary' : 'text-muted-foreground active:bg-muted',
          )}
          aria-expanded={menuAbierto}
        >
          <span className={cn('absolute top-0 h-0.5 w-10 bg-transparent transition-colors', menuAbierto && 'bg-primary')} />
          <Menu className={cn('h-5 w-5', menuAbierto && 'stroke-[2.5]')} />
          <span>Menú</span>
        </button>
      </nav>

      <MobileMenuSheet open={menuAbierto} onClose={() => setMenuAbierto(false)} />
    </>
  );
}
