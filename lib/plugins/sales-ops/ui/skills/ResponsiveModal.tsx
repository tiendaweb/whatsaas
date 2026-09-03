'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * Un diálogo en escritorio, una hoja desde abajo en el teléfono.
 *
 * El Prompt Studio se usa tanto sentado como caminando, y un diálogo centrado
 * en una pantalla de 5" deja el formulario debajo del teclado. La hoja inferior
 * sube con el pulgar y deja los botones al alcance; en escritorio, en cambio,
 * una hoja que ocupa todo el ancho se lee peor que un diálogo.
 *
 * El corte es el mismo que usa el shell (`lg`), así la app no cambia de idea a
 * mitad de camino entre una pantalla y otra.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return isDesktop;
}

export type ResponsiveModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Barra fija al pie: los botones no se van con el scroll del contenido. */
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function ResponsiveModal({ open, onOpenChange, title, description, footer, className, children }: ResponsiveModalProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn('flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl', className)}>
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
            <DialogTitle className="text-base">{title}</DialogTitle>
            {description && <DialogDescription className="text-xs">{description}</DialogDescription>}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="shrink-0 border-t border-border bg-card px-5 py-3">{footer}</div>}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn('flex h-[92dvh] flex-col gap-0 rounded-t-2xl p-0', className)}
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
          <SheetTitle className="text-base leading-tight">{title}</SheetTitle>
          {description && <SheetDescription className="text-xs">{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-border bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
