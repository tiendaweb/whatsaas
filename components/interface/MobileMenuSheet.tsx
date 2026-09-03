'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { LogOut, Search, Settings, X } from 'lucide-react';
import { signOut } from '@/app/[locale]/(login)/actions';
import { cn } from '@/lib/utils';
import { useNavegacion, type NavEntry } from './use-navigation';

/**
 * El ÚNICO menú desplegable del móvil.
 *
 * Antes convivían tres: la barra inferior de /dashboard, un botón flotante con
 * una hoja de nueve accesos escritos a mano, y un cajón lateral que metía la
 * barra de escritorio entera dentro del celular. Ninguno mostraba las
 * aplicaciones instaladas del equipo. Este las muestra todas, con buscador,
 * porque con veinte apps una grilla sin filtro tampoco se navega.
 */
export function MobileMenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { mainNav, apps } = useNavegacion();
  const [busqueda, setBusqueda] = useState('');

  // Navegar cierra la hoja: sin esto quedaba abierta encima de la pantalla nueva.
  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) setBusqueda('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtrar = (items: NavEntry[]) => {
    const query = busqueda.trim().toLocaleLowerCase('es');
    if (!query) return items;
    return items.filter((item) => item.label.toLocaleLowerCase('es').includes(query));
  };

  const navFiltrado = useMemo(() => filtrar(mainNav), [mainNav, busqueda]);
  const appsFiltradas = useMemo(() => filtrar(apps), [apps, busqueda]);
  const sinResultados = navFiltrado.length === 0 && appsFiltradas.length === 0;

  const activo = (href: string) => {
    const limpio = pathname.replace(/^\/(pt|en|es)(?=\/|$)/, '') || '/';
    const base = href.split('?')[0];
    return base !== '/dashboard' ? limpio.startsWith(base) : limpio === '/dashboard';
  };

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[60] bg-black/50 transition-opacity md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden
      />

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-[61] flex max-h-[85vh] flex-col rounded-t-3xl border-t bg-card shadow-2xl transition-transform duration-300 md:hidden',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
      >
        <div className="flex justify-center pt-3">
          <div className="h-1 w-12 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex items-center gap-2 px-4 pb-3 pt-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar sección o aplicación…"
              className="w-full rounded-full bg-muted py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {sinResultados && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nada coincide con «{busqueda}».
            </p>
          )}

          {navFiltrado.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Navegación
              </h3>
              <div className="grid grid-cols-4 gap-1">
                {navFiltrado.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 transition-colors',
                      activo(item.href) ? 'bg-primary/10 text-primary' : 'text-muted-foreground active:bg-muted',
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="text-center text-[10px] font-medium leading-tight">{item.label}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {appsFiltradas.length > 0 && (
            <section className="mb-4">
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Aplicaciones
              </h3>
              <div className="grid grid-cols-4 gap-1">
                {appsFiltradas.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 active:bg-muted"
                  >
                    <span
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm',
                        item.gradient,
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                    </span>
                    <span className="text-center text-[10px] font-medium leading-tight text-foreground">
                      {item.label}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!busqueda && (
            <div className="flex items-center gap-2 border-t pt-3">
              <Link
                href="/settings"
                onClick={onClose}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-muted py-2.5 text-sm font-semibold text-foreground active:scale-[0.98]"
              >
                <Settings className="h-4 w-4" />
                Configuración
              </Link>
              <form action={signOut} className="flex-1">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-muted py-2.5 text-sm font-semibold text-destructive active:scale-[0.98]"
                >
                  <LogOut className="h-4 w-4" />
                  Salir
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
