'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, Columns3, LayoutGrid, ListChecks, Menu, MessageCircle, Plus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { MobileMenuSheet } from './MobileMenuSheet';

/**
 * Barra inferior del móvil. Es la MISMA en todas las pantallas del panel:
 * cuatro accesos y, siempre en el mismo lugar, el botón de menú.
 *
 * Antes cambiaba de forma según dónde estuvieras — en /dashboard era una barra
 * de cinco pestañas, y en el resto desaparecía y quedaba un botón flotante con
 * otra hoja distinta. Lo único que cambia ahora son los cuatro accesos de la
 * izquierda: dentro de la bandeja son las vistas (Chats/Kanban/Agenda/Tareas),
 * que es lo que se usa ahí; fuera son los destinos principales.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const t = useTranslations('Sidebar');
  const dashboardT = useTranslations('DashboardViews');

  const pathWithoutLocale = pathname.replace(/^\/(pt|en|es)(?=\/|$)/, '') || '/';

  const enPanel = [
    '/dashboard', '/contacts', '/seguimiento', '/settings', '/automation', '/drafts',
    '/analytics', '/templates', '/campaigns', '/apps', '/escritorio', '/plugins/',
  ].some((prefix) => pathWithoutLocale.startsWith(prefix));

  // Dentro de una conversación manda el chat: la barra taparía el teclado.
  const enChat = pathWithoutLocale.startsWith('/dashboard/chat/');
  if (!enPanel || enChat) return null;

  const enBandeja = pathWithoutLocale === '/dashboard';

  const abrirVista = (tab: 'chats' | 'kanban' | 'bookmarks' | 'tasks') => {
    if (tab === 'tasks') {
      router.push('/plugins/tasks');
      return;
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    if (tab === 'chats') {
      nextParams.delete('view');
      nextParams.delete('contactId');
      window.dispatchEvent(new Event('dashboard:show-chat-list'));
    } else {
      nextParams.set('view', tab);
      nextParams.delete('contactId');
      localStorage.setItem('dashboardActiveView', tab);
      window.dispatchEvent(new CustomEvent('dashboard:show-board', { detail: { view: tab } }));
    }
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const vistaActiva = searchParams.get('view');
  const tabBandeja = vistaActiva === 'desktop'
    ? 'tasks'
    : vistaActiva === 'kanban' || vistaActiva === 'bookmarks' || vistaActiva === 'tasks'
      ? vistaActiva
      : 'chats';

  const esRutaActiva = (href: string) =>
    href === '/dashboard' ? pathWithoutLocale === '/dashboard' : pathWithoutLocale.startsWith(href);

  type Slot = { key: string; label: string; icon: typeof MessageCircle; activo: boolean; onClick: () => void };

  const slots: Slot[] = enBandeja
    ? ([
        ['chats', dashboardT('chats_label'), MessageCircle],
        ['kanban', dashboardT('kanban_label'), Columns3],
        ['bookmarks', dashboardT('bookmarks_label'), CalendarRange],
        ['tasks', dashboardT('tasks_label'), ListChecks],
      ] as const).map(([id, label, icon]) => ({
        key: id,
        label,
        icon,
        activo: tabBandeja === id,
        onClick: () => abrirVista(id),
      }))
    : ([
        ['/dashboard', t('chats'), MessageCircle],
        ['/plugins/tasks', t('tasks'), ListChecks],
        ['/contacts', t('contacts'), Users],
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
      {enBandeja && tabBandeja === 'chats' && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('dashboard:open-new-chat'))}
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
          aria-label={dashboardT('new_chat_button')}
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
